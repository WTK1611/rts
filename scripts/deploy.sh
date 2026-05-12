#!/bin/sh
# Deploy rts to the Plesk VPS.
#
# WICHTIG: data/ (SQLite-Bestenliste) wird NIE auf den Server übertragen.
# Der Server hält seinen eigenen Stand unter /root/rts/data/rts.db (Volume-Mount
# ./data:/app/data in docker-compose.yml). rsync auf /root/rts/ läuft daher
# OHNE --delete und mit explizitem --exclude='data' / --exclude='data/'.
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# .env liegt im Repo-Root und enthält NBNL_VPS1_IP + DOMAIN
if [ -f .env ]; then
  # shellcheck disable=SC1091
  . ./.env
fi

: "${NBNL_VPS1_IP:?NBNL_VPS1_IP fehlt (in .env setzen)}"
: "${DOMAIN:=js.tobis.io}"

VPS="root@${NBNL_VPS1_IP}"
WEBROOT="/var/www/vhosts/tobis.io/${DOMAIN}/"
SRV_DIR="/root/rts/"

VERSION_FILE="$ROOT_DIR/VERSION"
[ -f "$VERSION_FILE" ] || echo 0 > "$VERSION_FILE"
NEW_VERSION=$(($(cat "$VERSION_FILE") + 1))
echo "$NEW_VERSION" > "$VERSION_FILE"

echo "[deploy] 1/4 build (v$NEW_VERSION)"
npm run build

echo "[deploy] 2/4 frontend → ${VPS}:${WEBROOT}"
rsync -az --delete dist/ "${VPS}:${WEBROOT}"

echo "[deploy] 3/4 server → ${VPS}:${SRV_DIR} (data/ ausgeschlossen, kein --delete)"
# Doppelter Schutz für die SQLite-Bestenliste:
#  a) Whitelist via --include / --exclude='*' lässt data/ ohnehin weg
#  b) explizites --exclude='data' / --exclude='data/' falls die Whitelist erweitert wird
rsync -az \
  --exclude='data' \
  --exclude='data/' \
  --include='Dockerfile' \
  --include='docker-compose.yml' \
  --include='.dockerignore' \
  --include='package.json' \
  --include='package-lock.json' \
  --include='tsconfig.json' \
  --include='server/***' \
  --include='shared/***' \
  --exclude='*' \
  ./ "${VPS}:${SRV_DIR}"

echo "[deploy] 4/4 docker compose up -d --build"
ssh "${VPS}" 'cd /root/rts && docker compose up -d --build'

echo "[deploy] smoke-test"
curl -sI "https://${DOMAIN}/?nocache=$(date +%s)" | head -5 || true

echo "[deploy] done."
