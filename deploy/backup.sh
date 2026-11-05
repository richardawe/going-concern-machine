#!/usr/bin/env bash
# Nightly database backup (cron). Keeps 14 local dumps in shared/backups, and, if RESTIC_REPOSITORY is set in
# shared/.env, sends an encrypted copy off the server and keeps 30 daily and 12 monthly copies there.
#   deploy/backup.sh <app-dir>
set -euo pipefail
APP=$1; cd "$APP"
set -a; . shared/.env; set +a
mkdir -p shared/backups
FILE="shared/backups/gcm-$(date -u +%Y%m%d-%H%M).dump"
pg_dump --format=custom --no-owner --file="$FILE" "${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL in shared/.env}"
ls -1t shared/backups/gcm-*.dump | tail -n +15 | xargs -r rm -f
if [ -n "${RESTIC_REPOSITORY:-}" ]; then
  restic backup --quiet --tag gcm "$FILE"
  restic forget --quiet --tag gcm --keep-daily 30 --keep-monthly 12 --prune
fi
echo "$(date -u +%FT%TZ) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
