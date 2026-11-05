#!/usr/bin/env bash
# Runs in GitHub Actions: copies release.tgz to the server and runs remote-deploy.sh from inside it.
# Needs SSH_KEY, SSH_KNOWN_HOSTS, SSH_USER, SSH_HOST, SSH_PORT and APP_DIR in the environment.
set -euo pipefail
: "${SSH_KEY:?Set the SSH_KEY secret on this GitHub environment}" "${SSH_KNOWN_HOSTS:?Set SSH_KNOWN_HOSTS}" "${SSH_HOST:?Set SSH_HOST}" "${SSH_USER:?Set SSH_USER}" "${APP_DIR:?Set the APP_DIR variable}"
RELEASE=$(cat release-id.txt); PORT=${SSH_PORT:-22}
install -m 700 -d ~/.ssh
printf '%s\n' "$SSH_KEY" > ~/.ssh/deploy && chmod 600 ~/.ssh/deploy
printf '%s\n' "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
OPTS=(-i ~/.ssh/deploy -o StrictHostKeyChecking=yes -o ServerAliveInterval=15)
TARGET="$SSH_USER@$SSH_HOST"
echo "Shipping $RELEASE to $SSH_HOST:$APP_DIR"
scp "${OPTS[@]}" -P "$PORT" release.tgz "$TARGET:$APP_DIR/incoming-$RELEASE.tgz"
ssh "${OPTS[@]}" -p "$PORT" "$TARGET" bash -s -- "$APP_DIR" "$RELEASE" <<'REMOTE'
set -euo pipefail
APP=$1 RELEASE=$2 TGZ="$1/incoming-$2.tgz" SCRIPT=$(mktemp)
tar -xzf "$TGZ" -O deploy/remote-deploy.sh > "$SCRIPT"
bash "$SCRIPT" "$APP" "$RELEASE" "$TGZ"; status=$?
rm -f "$SCRIPT"; exit $status
REMOTE
