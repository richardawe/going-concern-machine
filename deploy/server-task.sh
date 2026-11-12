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
    [[ "${EMAIL_MODE:-}" =~ ^(brevo|smtp)$ ]] && pass "EMAIL_MODE=$EMAIL_MODE" || fail "EMAIL_MODE must be brevo or smtp in production"
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
email-setup)
  # Send through a mailbox on this server instead of Brevo: sign-in@<domain>, made with cPanel's uapi. Its password
  # is generated here and written only to .env, never printed. Then the login is tested, the app switched over and
  # reloaded, and the DNS records the domain needs are printed (they are public).
  need_release
  D=${BASE_DOMAIN:?BASE_DOMAIN is not set}; BOX="sign-in@$D"; HOST=$(hostname -f)
  command -v uapi >/dev/null || { echo "✗ cPanel's uapi isn't available to $(whoami)."; exit 1; }
  grep -q '"brevo", "smtp"' current/dist-server/main.js || { echo "✗ The deployed release can't send by SMTP yet. Deploy the release that adds it first."; exit 1; }
  setenv() { if grep -q "^$1=" "$ENV"; then sed -i "s|^$1=.*|$1=$2|" "$ENV"; else printf '%s=%s\n' "$1" "$2" >> "$ENV"; fi; }
  cp -p "$ENV" "$ENV.before-email-setup-$(date -u +%Y%m%d%H%M%S)"
  PASS=$(openssl rand -base64 33 | tr -dc 'A-Za-z0-9' | head -c 32)
  if uapi --output=json Email list_pops regex="^sign-in@" 2>/dev/null | grep -q "\"$BOX\""; then
    uapi --output=json Email passwd_pop email=sign-in domain="$D" password="$PASS" | grep -q '"status":1' && pass "Mailbox [email] exists; gave it a new password" || { fail "Couldn't set the mailbox password"; exit 1; }
  else
    uapi --output=json Email add_pop email=sign-in domain="$D" password="$PASS" quota=250 | grep -q '"status":1' && pass "Created the mailbox [email]" || { fail "Couldn't create the mailbox (uapi Email add_pop)"; exit 1; }
  fi
  uapi --output=json EmailAuth enable_dkim domain="$D" >/dev/null 2>&1 || true
  # Remember Brevo's sender so email-use-brevo can switch back.
  [ "${EMAIL_MODE:-}" = brevo ] && setenv EMAIL_FROM_BREVO "${EMAIL_FROM:-}"
  setenv SMTP_HOST "$HOST"; setenv SMTP_PORT 465; setenv SMTP_SECURE true; setenv SMTP_USER "$BOX"; setenv SMTP_PASS "$PASS"
  chmod 600 "$ENV"
  echo "── Testing the login on $HOST:465"
  if (cd current && SMTP_PASS="$PASS" node -e "require('nodemailer').createTransport({host:'$HOST',port:465,secure:true,auth:{user:'$BOX',pass:process.env.SMTP_PASS},connectionTimeout:10000}).verify().then(()=>process.exit(0),e=>{console.error(String(e.message).slice(0,200));process.exit(1)})" 2>&1 | mask); then
    pass "The mailbox accepts the login"
  else fail "The mailbox login failed; the app still sends with ${EMAIL_MODE:-its old setting}"; exit 1; fi
  setenv EMAIL_FROM "$BOX"; setenv EMAIL_MODE smtp
  pm2 startOrReload current/ecosystem.config.cjs --update-env >/dev/null && pm2 save >/dev/null
  for i in $(seq 1 20); do curl -fsS "http://127.0.0.1:${PORT:-3100}/healthz" >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS "http://127.0.0.1:${PORT:-3100}/healthz" >/dev/null 2>&1 && pass "The app restarted and sends from [email] by SMTP" || fail "The app isn't healthy after the switch: run email-use-brevo, then recent-errors"
  echo "── DNS records for $D (add in Cloudflare → DNS, all DNS only)"
  echo "This server's address: $(curl -fsS -m 10 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')   host: $HOST"
  echo "Run the email-dns task for the exact SPF and DKIM records.";;
email-dns)
  # The DNS records cPanel expects for sending from this server (public information).
  D=${BASE_DOMAIN:?BASE_DOMAIN is not set}
  echo "── SPF records cPanel expects for $D"; uapi --output=json EmailAuth validate_current_spfs domain="$D" 2>&1 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=[...new Set(s.replace(/\\\\/g,'').match(/v=(DKIM1|spf1)[^\"]*/g)||[])];console.log(m.length?m.join('\\n'):'(none found) '+s.slice(0,600))})"
  echo "── DKIM record for default._domainkey.$D"; uapi --output=json EmailAuth validate_current_dkims domain="$D" 2>&1 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=[...new Set(s.replace(/\\\\/g,'').match(/v=(DKIM1|spf1)[^\"]*/g)||[])];console.log(m.length?m.join('\\n'):'(none found) '+s.slice(0,600))})";;
email-use-brevo)
  # Switch back to Brevo (once it has activated the account). The SMTP settings stay in .env for next time.
  ENVF="$ENV"; [ -n "${EMAIL_FROM_BREVO:-}" ] || { echo "✗ No saved Brevo sender (EMAIL_FROM_BREVO) in .env."; exit 1; }
  cp -p "$ENVF" "$ENVF.before-brevo-$(date -u +%Y%m%d%H%M%S)"
  sed -i "s|^EMAIL_MODE=.*|EMAIL_MODE=brevo|; s|^EMAIL_FROM=.*|EMAIL_FROM=$EMAIL_FROM_BREVO|" "$ENVF"
  need_release; pm2 startOrReload current/ecosystem.config.cjs --update-env >/dev/null && pm2 save >/dev/null
  for i in $(seq 1 20); do curl -fsS "http://127.0.0.1:${PORT:-3100}/healthz" >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS "http://127.0.0.1:${PORT:-3100}/healthz" >/dev/null 2>&1 && pass "The app sends through Brevo again" || fail "The app isn't healthy: run recent-errors";;
email-test)
  # Send one test sign-in style email to the address given, through whatever the app is set to use.
  need_release
  [ -n "$EMAIL" ] || { echo "✗ Enter the address to send the test to."; exit 1; }
  out=$(cd current && TO="$EMAIL" node --env-file="$ENV" -e "
    const nm = require('nodemailer'); const e = process.env;
    const send = e.EMAIL_MODE === 'smtp'
      ? nm.createTransport({ host: e.SMTP_HOST, port: +e.SMTP_PORT || 465, secure: e.SMTP_SECURE !== 'false', auth: { user: e.SMTP_USER, pass: e.SMTP_PASS } })
          .sendMail({ from: { name: e.EMAIL_FROM_NAME || 'Going Concern Lab', address: e.EMAIL_FROM }, to: process.env.TO, subject: 'Going Concern Lab test email', text: 'This is a test from the Going Concern Lab server. Sign-in codes will come from this address.' })
      : fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': e.BREVO_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ sender: { email: e.EMAIL_FROM, name: e.EMAIL_FROM_NAME || 'Going Concern Lab' }, to: [{ email: process.env.TO }], subject: 'Going Concern Lab test email', textContent: 'This is a test from the Going Concern Lab server.' }) }).then(async r => { if (!r.ok) throw new Error('Brevo ' + r.status + ': ' + (await r.text()).slice(0, 200)); });
    send.then(() => console.log('sent via ' + e.EMAIL_MODE), err => { console.log('failed via ' + e.EMAIL_MODE + ': ' + String(err.message).slice(0, 300)); process.exit(1); });
  " 2>&1); rc=$?
  echo "$out" | mask; [ $rc = 0 ] && pass "Test email sent to [email]. Check the inbox and the junk folder." || fail "The test email wasn't sent";;
rollback)
  need_release; bash current/deploy/rollback.sh "$APP" ${RELEASE:+"$RELEASE"};;
recent-errors)
  need_release
  echo "── Errors and crashes (error.log)"; tail -n 60 shared/logs/error.log 2>/dev/null | mask
  echo "── Server errors in the request log"; grep -E '"level":(50|60)' shared/logs/app.log 2>/dev/null | tail -n 30 | cut -c1-400 | mask;;
*) echo "Unknown task: $TASK"; exit 1;;
esac
