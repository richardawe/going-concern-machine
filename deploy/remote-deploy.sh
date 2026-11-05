#!/usr/bin/env bash
# Runs ON THE SERVER, called by the GitHub Actions deploy job:
#   remote-deploy.sh <app-dir> <release-id> <tarball>
# Unpacks the release, installs production packages, backs up the database, migrates, switches the `current`
# symlink, reloads PM2, and checks /healthz reports the new release. If the check fails it switches back.
set -euo pipefail
APP=$1 RELEASE=$2 TARBALL=$3
export PATH="/opt/cpanel/ea-nodejs22/bin:$HOME/.npm-global/bin:$PATH"
cd "$APP"
set -a; . shared/.env; set +a
DIR="releases/$RELEASE"
echo "→ Unpacking $RELEASE"
rm -rf "$DIR"; mkdir -p "$DIR" shared/logs shared/backups
tar -xzf "$TARBALL" -C "$DIR"; rm -f "$TARBALL"
echo "$RELEASE" > "$DIR/RELEASE"
(cd "$DIR" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)

echo "→ Backing up the database before migrating"
pg_dump --format=custom --no-owner --file="shared/backups/pre-deploy-$RELEASE.dump" "${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL in shared/.env (the read-only backup role, see docs/DEPLOYMENT.md)}"
ls -1t shared/backups/pre-deploy-*.dump | tail -n +6 | xargs -r rm -f

echo "→ Migrating"
(cd "$DIR" && MIGRATIONS_DIR=migrations node dist-server/migrate.js)

PREVIOUS=$(readlink current 2>/dev/null || true)
switch() { ln -sfn "$1" current.next && mv -T current.next current; }
switch "$DIR"
echo "→ Reloading ($(basename "$DIR"))"
pm2 startOrReload current/ecosystem.config.cjs --update-env
pm2 save >/dev/null

echo "→ Checking health"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/healthz" | grep -q "\"release\":\"$RELEASE\""; then
    echo "✓ $RELEASE is live"
    ls -1dt releases/*/ | tail -n +6 | xargs -r rm -rf   # keep the last 5 releases
    exit 0
  fi
  sleep 2
done
echo "✗ $RELEASE did not become healthy; rolling back to ${PREVIOUS:-nothing}"
# The repository is public, so Actions logs are too: show recent errors with email addresses masked.
tail -n 40 shared/logs/error.log 2>/dev/null | sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[email]/g' || true
if [ -n "$PREVIOUS" ]; then switch "$PREVIOUS"; pm2 startOrReload current/ecosystem.config.cjs --update-env; fi
exit 1
