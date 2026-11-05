#!/usr/bin/env bash
# Runs ON THE SERVER as the app user, sent by the "Server task" workflow: a fixed menu of operations, never
# arbitrary commands. The repository is public, so its Actions logs are too: this prints no secrets, and the
# workflow masks the email addresses it passes in.
#   server-task.sh <app-dir> <task> [email] [name] [release]
set -uo pipefail
APP=$1 TASK=$2 EMAIL=${3:-} NAME=${4:-} RELEASE=${5:-}
export PATH="/opt/cpanel/ea-nodejs22/bin:$HOME/.npm-global/bin:/usr/pgsql-18/bin:/usr/pgsql-17/bin:/usr/pgsql-16/bin:$PATH"
cd "$APP" 2>/dev/null || { echo "✗ $APP doesn't exist. Create it: mkdir -p $APP/shared (docs/DEPLOYMENT.md, section 2)"; exit 1; }
ENV="$APP/shared/.env"
[ -f "$ENV" ] && { set -a; . "$ENV"; set +a; }
mask() { sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[email]/g; s#(postgres(ql)?://)[^@ ]+@#\1***@#g'; }
ok=0 bad=0
pass() { echo "✓ $*"; ok=$((ok + 1)); }
fail() { echo "✗ $*"; bad=$((bad + 1)); }
need_release() { [ -L current ] || { echo "✗ Nothing is deployed yet. Merge to main and approve the deploy first."; exit 1; }; }
node_env() { (cd current && node --env-file="$ENV" "$@"); }   # absolute: current is a symlink, so ../ would mean releases/

case "$TASK" in
preflight)
  echo "Checking the server for Going Concern ($(whoami) on $(hostname -s))"
  echo "── Software"
  v=$(node -v 2>/dev/null); [[ "$v" == v22* ]] && pass "Node $v" || fail "Node 22 not found (have: ${v:-none}). WHM → EasyApache 4 → Additional Packages → ea-nodejs22"
  command -v pm2 >/dev/null && pass "PM2 $(pm2 -v 2>/dev/null | tail -1)" || fail "PM2 missing. As gcm: npm config set prefix ~/.npm-global && npm install -g pm2@5"
  command -v pg_dump >/dev/null && pass "pg_dump $(pg_dump --version | awk '{print $3}')" || fail "pg_dump not found on PATH"
  systemctl is-enabled "pm2-$(whoami)" >/dev/null 2>&1 && pass "PM2 starts at boot" || fail "PM2 doesn't start at boot yet. As gcm run: pm2 startup, then run the command it prints as root"
  echo "── Settings ($ENV)"
  if [ ! -f "$ENV" ]; then fail ".env missing: create $ENV from .env.example"
  else
    [ "$(stat -c %a "$ENV")" = 600 ] && pass ".env is private (600)" || fail ".env should be private: chmod 600 $ENV"
    for k in ENVIRONMENT_NAME PORT BASE_DOMAIN DATABASE_URL BACKUP_DATABASE_URL SESSION_SECRET EMAIL_MODE BREVO_API_KEY EMAIL_FROM STATIC_DIR; do
      [ -n "${!k:-}" ] && pass "$k is set" || fail "$k is empty"; done
    [ "${#SESSION_SECRET}" -ge 32 ] 2>/dev/null && pass "SESSION_SECRET is long enough" || fail "SESSION_SECRET must be at least 32 characters: openssl rand -base64 48"
    [ "${SECURE_COOKIES:-true}" = true ] && pass "SECURE_COOKIES=true" || fail "SECURE_COOKIES must be true in production"
    [ "${EMAIL_MODE:-}" = brevo ] && pass "EMAIL_MODE=brevo" || fail "EMAIL_MODE must be brevo in production"
  fi
  echo "── Database"
  if [ -n "${DATABASE_URL:-}" ]; then
    r=$(psql "$DATABASE_URL" -tA -c "select rolsuper, rolbypassrls, current_setting('server_version_num')::int from pg_roles where rolname = current_user" 2>&1)
    if [[ "$r" == *"|"* ]]; then
      IFS='|' read -r su by ver <<<"$r"
      pass "The app can connect to PostgreSQL ($((ver / 10000)))"
      [ "$su" = f ] && [ "$by" = f ] && pass "The app's role is not a superuser and can't bypass row-level security" || fail "The app's role must not be a superuser or bypassrls (universities' data would not be isolated)"
      [ "$ver" -ge 140000 ] && pass "PostgreSQL is 14 or newer" || fail "PostgreSQL 14 or newer is needed"
    else fail "The app can't connect to PostgreSQL: $(echo "$r" | head -1 | mask). If it says ident or peer authentication failed, see docs/DEPLOYMENT.md (pg_hba.conf)"; fi
  fi
  if [ -n "${BACKUP_DATABASE_URL:-}" ]; then
    r=$(psql "$BACKUP_DATABASE_URL" -tA -c "select rolbypassrls, pg_has_role(current_user, 'pg_read_all_data', 'member') from pg_roles where rolname = current_user" 2>&1)
    [ "$r" = "t|t" ] && pass "The backup role can read everything" || fail "The backup role isn't ready: $(echo "$r" | head -1 | mask). It needs bypassrls and pg_read_all_data"
  fi
  echo "── Email"
  if [ -n "${BREVO_API_KEY:-}" ]; then
    c=$(curl -s -o /dev/null -w '%{http_code}' -m 15 -H "api-key: $BREVO_API_KEY" https://api.brevo.com/v3/account)
    [ "$c" = 200 ] && pass "Brevo accepts the API key" || fail "Brevo rejected the API key (HTTP $c)"
  fi
  echo "── Web server"
  D=${BASE_DOMAIN:-}
  if [ -n "$D" ]; then
    issuer=$(echo | openssl s_client -connect 127.0.0.1:443 -servername "$D" 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null)
    [[ "$issuer" == *CloudFlare* || "$issuer" == *Cloudflare* ]] && pass "Apache serves the Cloudflare origin certificate for $D" || fail "Apache isn't serving the Cloudflare origin certificate for $D (issuer: ${issuer:-none})"
    issuer=$(echo | openssl s_client -connect 127.0.0.1:443 -servername "preflight-check.$D" 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null)
    [[ "$issuer" == *CloudFlare* || "$issuer" == *Cloudflare* ]] && pass "…and for *.$D" || fail "Apache isn't serving the origin certificate for *.$D (install it on the wildcard subdomain too)"
    for h in "$D" "preflight-check.$D"; do
      body=$(curl -sk -m 10 --resolve "$h:443:127.0.0.1" "https://$h/healthz" -w '\n%{http_code}'); code=${body##*$'\n'}
      if [[ "$body" == *'"release"'* ]]; then pass "Apache passes $h to the app"
      elif [ "$code" = 502 ] || [ "$code" = 503 ]; then pass "Apache passes $h to Node (the app isn't running yet: that's fine before the first deploy)"
      else fail "Apache isn't passing $h to Node (HTTP $code). Check the proxy file for this vhost and rebuild httpd.conf"; fi
    done
    for h in "$D" "preflight-check.$D"; do
      hdr=$(curl -sI -m 15 "https://$h/healthz" 2>/dev/null); code=$(echo "$hdr" | awk 'NR==1{print $2}')
      if ! echo "$hdr" | grep -qi '^server: cloudflare'; then fail "$h doesn't go through Cloudflare yet (DNS still propagating, or the record isn't proxied)"
      elif [ "$code" = 526 ]; then fail "Cloudflare says the origin certificate is invalid for $h (526)"
      elif [ "$code" = 525 ]; then fail "Cloudflare can't complete TLS with the server for $h (525)"
      elif [ "$code" = 521 ] || [ "$code" = 522 ]; then fail "Cloudflare can't reach the server for $h ($code): firewall or Apache"
      else pass "$h answers through Cloudflare (HTTP $code)"; fi
    done
  fi
  echo "── Space"
  avail=$(df -Pk "$HOME" | awk 'NR==2{print int($4/1048576)}')
  [ "$avail" -ge 5 ] && pass "${avail} GB free" || fail "Only ${avail} GB free"
  echo; echo "$ok passed, $bad to fix."; [ "$bad" = 0 ];;

status)
  need_release
  echo "Release: $(basename "$(readlink current)")"
  echo "Health:  $(curl -s -m 5 "http://127.0.0.1:${PORT}/healthz")"
  pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s||"[]"))console.log(`PM2:     ${p.name}#${p.pm_id} ${p.pm2_env.status}, restarts ${p.pm2_env.restart_time}, ${Math.round(p.monit.memory/1e6)} MB`)})'
  echo "Disk:    $(df -Ph "$HOME" | awk 'NR==2{print $4" free of "$2}')"
  echo "Releases kept: $(ls -1t releases | tr '\n' ' ')"
  echo "Latest backups:"; ls -1t shared/backups 2>/dev/null | head -3 | sed 's/^/  /'
  echo "Last backup log:      $(tail -n 1 shared/logs/backup.log 2>/dev/null || echo none)"
  echo "Last maintenance log: $(tail -n 1 shared/logs/maintenance.log 2>/dev/null | cut -c1-200 | mask || echo none)"
  echo "Cron jobs:"; crontab -l 2>/dev/null | grep -E 'backup.sh|maintenance.js' | sed 's/^/  /' || echo "  none (run the install-cron task)";;

add-admin)
  need_release; node_env dist-server/platform-admin.js add "$EMAIL" "$NAME" | mask;;
reset-2fa)
  need_release; node_env dist-server/platform-admin.js reset-2fa "$EMAIL" | mask;;
list-admins)
  need_release; node_env dist-server/platform-admin.js list | mask;;
backup-now)
  need_release; bash current/deploy/backup.sh "$APP";;
install-cron)
  need_release
  NODE=$(command -v node)
  { crontab -l 2>/dev/null | grep -v -E 'gcm-(backup|maintenance)'
    echo "15 2 * * * $APP/current/deploy/backup.sh $APP >> $APP/shared/logs/backup.log 2>&1 # gcm-backup"
    echo "40 2 * * * cd $APP/current && $NODE --env-file=$APP/shared/.env dist-server/maintenance.js >> $APP/shared/logs/maintenance.log 2>&1 # gcm-maintenance"
  } | crontab -
  echo "Installed:"; crontab -l | grep 'gcm-' | sed 's/^/  /';;
maintenance-dry-run)
  need_release; node_env dist-server/maintenance.js --dry-run | mask;;
rollback)
  need_release; bash current/deploy/rollback.sh "$APP" ${RELEASE:+"$RELEASE"};;
recent-errors)
  need_release
  echo "── Errors and crashes (error.log)"; tail -n 60 shared/logs/error.log 2>/dev/null | mask
  echo "── Server errors in the request log"; grep -E '"level":(50|60)' shared/logs/app.log 2>/dev/null | tail -n 30 | cut -c1-400 | mask;;
*) echo "Unknown task: $TASK"; exit 1;;
esac
