# Jäger und Sammler

Ein browserbasiertes, isometrisches Multiplayer-RTS in der Steinzeit. Bis zu zehn
Spieler steuern parallel je einen Stamm aus vier Jäger:innen und Sammler:innen
auf einer prozedural erzeugten, unendlichen Welt aus Wiesen, Wäldern, Savannen,
Wüsten, Flüssen, Seen, Felsen, Gebirgen und Canyons. Holz, Beeren, Pilze, Stein,
Wasser, Fisch und Fleisch wollen gesammelt, Tiere gejagt und Konkurrenten
beobachtet werden — alles in einer einzigen, dauerhaft laufenden Welt.

Client: TypeScript + [Phaser 3](https://phaser.io/) (Vite).
Server: Node + WebSocket, autoritative Simulation mit 20 Hz Tickrate.
Welt: deterministische Worldgen aus einem Seed, geteilt zwischen Client und Server.

## Inhalt

- [Schnellstart](#schnellstart)
- [Lokale Entwicklung](#lokale-entwicklung)
- [Production-Build](#production-build)
- [Deployment via Docker](#deployment-via-docker)
- [Bedienung](#bedienung)
- [Projektstruktur](#projektstruktur)
- [Weiterführende Doku](#weiterführende-doku)

## Schnellstart

Voraussetzungen: Node 20+, npm.

```sh
npm install
npm run dev
```

Das startet WebSocket-Server (Port 8787) und Vite-Dev-Server parallel.
Spiel öffnen: <http://localhost:5173>

Mehrere Browser-Tabs/Geräte ins gleiche LAN verbinden sich automatisch zum
gleichen Server und teilen sich die Welt (max. 10 gleichzeitige Spieler).

## Lokale Entwicklung

| Befehl | Wirkung |
|---|---|
| `npm run dev` | Server + Client gleichzeitig (mit Hot-Reload) |
| `npm run dev:server` | Nur den WebSocket-Server (`tsx watch`) |
| `npm run dev:client` | Nur den Vite-Client |
| `npm run build` | TypeScript prüfen + statisches Frontend bauen (`dist/`) |
| `npm run preview` | Den gebauten Client lokal serven |

Der Server hört auf `PORT` (Default `8787`) und akzeptiert beliebig viele
Verbindungen, bis 10 Slots belegt sind. Ein 11. Spieler bekommt eine
Fehlermeldung.

Der Client wählt den WebSocket-Endpoint automatisch:

- `VITE_SERVER_URL` (z. B. `wss://example.com/ws`) — explizit überschreiben
- bei `https://` → `wss://<host>/ws` (für Reverse-Proxy-Setups gedacht)
- sonst → `ws://<hostname>:8787` (lokale Entwicklung)

## Production-Build

```sh
npm run build
```

Erzeugt einen statischen Client in `dist/`, der hinter beliebigen Webservern
ausgeliefert werden kann. Der WebSocket-Server muss separat laufen — siehe
nächster Abschnitt.

## Deployment via Docker

Der Server kann als Container betrieben werden:

```sh
docker compose up -d --build
```

Konfiguration siehe [`Dockerfile`](Dockerfile) und
[`docker-compose.yml`](docker-compose.yml). Per Default lauscht der Container
intern auf Port 8787 und exponiert ihn nur auf `127.0.0.1` — vorgesehen für
Setups, in denen ein Reverse-Proxy (nginx, Plesk, Caddy …) TLS terminiert und
unter `/ws` zum Container weiterleitet.

Ein typisches Production-Setup:

```
Browser ──https──▶ nginx/Caddy ──http──▶ Vite-Build (statisch, dist/)
                              ──ws────▶ rts-server (Container, :8787)
```

Der konkrete Plesk-Deploy auf `js.tobis.io` (Pfade, rsync-Schritte, Webroot-Falle)
ist in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) dokumentiert.

## Bedienung

Maus + Tastatur:

- **Linksklick auf Einheit** — Einzelauswahl
- **Linksklick + Ziehen** — Boxauswahl
- **Rechtsklick** auf Boden → Bewegen, auf Ressource → Sammeln, auf Tier → Jagen
- **WASD** oder **Pfeiltasten** — gesamten Stamm in eine Richtung bewegen
- **Mausrad** — Zoom
- **M** — Minimap ein/aus
- Mauszeiger an den Bildschirmrand → Edge-Pan

Touch:

- **Tippen auf Boden / Tier / Ressource** — kommandiert den ganzen Stamm
- **Wischen** — Kamera schwenken
- **Pinch** — Zoom

Eine ausführlichere Beschreibung der Spielmechanik (Ressourcen, HP, Tiere,
Auto-Sammeln, Tribe-Tod) findet sich in [docs/GAMEPLAY.md](docs/GAMEPLAY.md).

## Projektstruktur

```
.
├── index.html           # Lobby + HUD-Markup, Einstiegspunkt für Vite
├── src/                 # Client (Phaser-Szene, Renderer, Eingaben, Net)
│   ├── main.ts
│   ├── net.ts
│   ├── iso.ts
│   ├── scenes/GameScene.ts
│   ├── Unit.ts / Animal.ts / Tree.ts / Bush.ts / ...
├── server/              # Autoritativer WebSocket-Server
│   ├── index.ts         # Verbindungs- und Tick-Loop
│   └── sim.ts           # Spielwelt, Einheiten, Tiere, Wirtschaft
├── shared/              # Code, der zwischen Client und Server geteilt wird
│   ├── protocol.ts      # Nachrichten-Typen, Konstanten
│   ├── worldgen.ts      # deterministische Welt aus Seed
│   └── pathfinding.ts   # A* auf Tile-Grid
├── scripts/dev-server.sh
├── Dockerfile / docker-compose.yml
└── docs/
    ├── ARCHITECTURE.md
    └── GAMEPLAY.md
```

## Weiterführende Doku

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — VPS-Pfade und rsync+docker-Deploy
  für `js.tobis.io`.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Architektur, Netzwerkprotokoll,
  Worldgen, Tickloop, Sichtbarkeit
- [docs/GAMEPLAY.md](docs/GAMEPLAY.md) — Gameplay-Mechanik, Ressourcen, Tiere,
  HP-System, Game-Over

## Lizenz

Kein Lizenztext hinterlegt. Wenn du den Code wiederverwenden willst, frag
zuerst.
