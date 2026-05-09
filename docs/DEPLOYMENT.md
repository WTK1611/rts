# Deployment auf Plesk-VPS (`js.tobis.io`)

Der laufende Production-Stack auf dem Plesk-VPS. Die generische Doku zu
Build & Container-Setup steht in [README.md](../README.md#deployment-via-docker);
dieses Dokument ergänzt das um die konkreten Pfade und einen reproduzierbaren
Deploy-Ablauf.

## Hosts und Pfade

| Stück | Pfad / Wert |
|---|---|
| Host | `root@${NBNL_VPS1_IP}` (aus `.env`, SSH-Key-Auth eingerichtet) |
| Domain | `${DOMAIN}` aus `.env` → `js.tobis.io` |
| Frontend-Webroot (LIVE) | `/var/www/vhosts/tobis.io/js.tobis.io/` |
| Server-Compose-Pfad | `/root/rts/` |
| Container | `rts-server`, lauscht intern auf `127.0.0.1:8787` |

> **Falle**: Plesk legt automatisch eine leere Hülle unter
> `/var/www/vhosts/js.tobis.io/httpdocs/` an. Diese wird **nicht** vom nginx-vhost
> bedient — wer dorthin deployed, sieht eine stale `index.html` mit
> `Last-Modified` aus der Plesk-Erstkonfiguration und wundert sich.
> Echter Webroot ist `/var/www/vhosts/tobis.io/<subdomain>/`.

## Voraussetzungen

- `.env` im Projekt mit `NBNL_VPS1_IP=…` und `DOMAIN=js.tobis.io`
- SSH-Key-Auth zu `root@$NBNL_VPS1_IP` (kein Passwort-Prompt)
- `rsync`, `ssh`, `curl` lokal

## Ablauf

```sh
set -a; source .env; set +a

# 1) Frontend lokal bauen
npm run build

# 2) Frontend in den echten Plesk-Webroot synchronisieren
rsync -az --delete dist/ "root@${NBNL_VPS1_IP}:/var/www/vhosts/tobis.io/${DOMAIN}/"

# 3) Server-Sources nach /root/rts (kein Git-Repo dort, nur Compose-Quelle)
rsync -az \
  --include='Dockerfile' --include='docker-compose.yml' --include='.dockerignore' \
  --include='package.json' --include='package-lock.json' --include='tsconfig.json' \
  --include='server/***' --include='shared/***' --exclude='*' \
  ./ "root@${NBNL_VPS1_IP}:/root/rts/"

# 4) Container neu bauen und starten
ssh "root@${NBNL_VPS1_IP}" 'cd /root/rts && docker compose up -d --build'

# 5) Smoke-Test (frische Last-Modified + neuer index-*.js-Hash erwartet)
curl -sI "https://${DOMAIN}/?nocache=$(date +%s)" | head -10
ssh "root@${NBNL_VPS1_IP}" 'docker logs --tail 15 rts-server'
```

## Build-Falle: PWA-Precache-Limit

`vite-plugin-pwa` (Workbox) bricht den Build ab, sobald ein Asset > 2 MiB ist.
`public/image/js_icon.png` (~2.7 MB, Lobby-Hintergrund) ist deshalb in
[`vite.config.ts`](../vite.config.ts) via `globIgnores` aus dem Precache
ausgeklammert — Offline-Caching dieses Assets bringt nichts und das Limit
hochzuziehen würde unnötig SW-Cache verbrauchen. **Nicht entfernen.**

## Verifikation

Erfolgreicher Deploy:

- `curl -sI https://${DOMAIN}/` liefert `200` und ein `Last-Modified` aus
  der Deploy-Minute — nicht aus der Plesk-Erstkonfiguration.
- Die HTML enthält den frisch gehashten Bundle-Namen
  (`index-*.js`).
- `docker ps` zeigt `rts-server` als `Up`, Logs starten mit
  `[rts-server] listening on ws://0.0.0.0:8787`.
