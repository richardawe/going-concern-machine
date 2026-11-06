#!/usr/bin/env bash
# Runs ON THE SERVER: switch back to the previous release (or a named one) and reload.
#   deploy/rollback.sh <app-dir> [release-id]
# Migrations only ever add, so older code runs against the newer database.
set -euo pipefail
APP=$1; cd "$APP"
export PATH="/opt/cpanel/ea-nodejs22/bin:$HOME/.npm-global/bin:/usr/pgsql-18/bin:/usr/pgsql-17/bin:/usr/pgsql-16/bin:$PATH"
CURRENT=$(basename "$(readlink current)")
TARGET=${2:-$(ls -1t releases | grep -vx "$CURRENT" | head -1)}
[ -d "releases/$TARGET" ] || { echo "No release $TARGET. Available:"; ls -1t releases; exit 1; }
ln -sfn "releases/$TARGET" current.next && mv -T current.next current
pm2 startOrReload current/ecosystem.config.cjs --update-env && pm2 save >/dev/null
echo "Rolled back from $CURRENT to $TARGET."
