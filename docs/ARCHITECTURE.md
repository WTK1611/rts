# Architektur

Dieses Dokument beschreibt, wie Client und Server zusammenarbeiten, wie die Welt
erzeugt wird und welche Nachrichten über den WebSocket fließen.

## Überblick

```
┌──────────────────────────┐         WebSocket (JSON)        ┌──────────────────────────┐
│         Client           │  ◀──────────────────────────▶  │          Server          │
│ Phaser 3 / TypeScript    │                                 │ Node + ws / TypeScript   │
│                          │                                 │                          │
│ • Lobby + Eingabe        │  join / move / harvest / hunt  │ • Slot-Management (10×)  │
│ • Iso-Renderer + Fog     │  ────────────────────────────▶ │ • Autoritative Sim       │
│ • Eigene Sicht / HUD     │                                 │ • Tickloop (20 Hz)       │
│ • Worldgen aus Seed      │  init / state / opponent…      │ • Worldgen aus Seed      │
│   (deterministisch)      │  ◀──────────────────────────── │ • A*-Pathfinding         │
└──────────────────────────┘                                 └──────────────────────────┘
                                  │ shared/protocol.ts │
                                  │ shared/worldgen.ts │
                                  │ shared/pathfinding │
```

Die Welt selbst (Biome, Bäume, Büsche, Pilze, Stein, Fisch, Höhe) ist eine reine
Funktion des Seeds — Client und Server berechnen sie unabhängig voneinander aus
denselben Hash-Funktionen ([`shared/worldgen.ts`](../shared/worldgen.ts)). Über
das Netz wandern nur Mutationen: abgebaute Objekte, nachgewachsene Objekte,
Einheiten, Tiere, Ressourcen, Spuren.

## Server

Eintrittspunkt: [`server/index.ts`](../server/index.ts).
Simulation:    [`server/sim.ts`](../server/sim.ts).

### Lebenszyklus

1. **Start** — beim Start wird ein zufälliger Seed gewürfelt und der `Sim`
   gebootet. `Sim.spawnAnimals` läuft einmalig über einen Bereich von
   `±ANIMAL_SPAWN_RADIUS` Tiles und füllt ihn nach Biom und Dichte mit
   Tieren.
2. **Verbindungen** — eingehende WebSockets warten auf eine `join`-Nachricht.
   Erst nach `join` wird ein Spieler-Slot belegt (`MAX_PLAYERS = 10`).
3. **Tickloop** — alle 50 ms (`TICK_RATE = 20`) ruft der Server `Sim.step(dt)`
   und sendet jedem aktiven Spieler eine `state`-Nachricht.
4. **Disconnect** — beim `close`/`error`-Event räumt der Server den Slot, gibt
   alle Einheiten frei und benachrichtigt die übrigen Spieler.

### Slot-Management

`world.players` ist ein Array `(PlayerSlot | null)[]` der Länge 10. Wer connected
bekommt den niedrigsten freien Index, dadurch ist die Spielerfarbe stabil
(`PLAYER_COLORS[id]`). Auch der Spawnpunkt ist deterministisch aus
`spawnsFromSeed(seed)[id]`.

### Sichtbarkeit / Fog of War (Server-seitig)

Tiere werden **pro Spieler** gefiltert: Ein Spieler sieht ein Tier nur, wenn es
im Radius `ANIMAL_VIEW_RADIUS = 10` einer eigenen Einheit liegt. Der Server
hält pro Spieler ein `knownAnimals: Set<string>`. Verschwindet ein Tier aus dem
Sichtradius, taucht seine ID in der nächsten `state.removedAnimalIds` auf —
genau wie wenn es gestorben wäre. Dadurch ist Fog of War für Tiere autoritativ.

Statische Welt-Objekte (Bäume usw.) werden nicht gefoggt: Das Worldgen ist eh
deterministisch und der Client zeichnet alles selbst, gefoggte Tiles werden
clientseitig nur abgedunkelt.

Andere Spielereinheiten werden derzeit für alle sichtbar übertragen — siehe
[`Sim.unitsSnapshot`](../server/sim.ts).

## Client

Eintrittspunkt: [`src/main.ts`](../src/main.ts).
Hauptszene:    [`src/scenes/GameScene.ts`](../src/scenes/GameScene.ts).

### Boot

`main.ts` zeigt erst die Lobby (HTML/CSS in [`index.html`](../index.html)),
verbindet bei „Spielen“ den WebSocket und schickt `{ type: "join", name }`.
Sobald die `init`-Nachricht eintrifft, wird Phaser gestartet und `GameScene`
mit dem Init-Snapshot initialisiert.

### Renderer

- **Isometrisch**, Tile-Größe `TILE_W = 64, TILE_H = 32` (siehe
  [`src/iso.ts`](../src/iso.ts)).
- **Chunked**: 16×16-Tile-Chunks werden bei Bedarf erzeugt und beim Verlassen
  des Sichtfelds wieder zerstört (`updateChunks`).
- **Höhenkarte**: Pro Biom liefert [`heightAt`](../shared/worldgen.ts) ein
  Profil aus `base + fbm * hill`. Tiles werden mit Slope-Shading gezeichnet,
  Wasser bekommt einen Tiefen-Verlauf je nach Distanz zum Ufer
  (`waterShadeAt`).
- **Fog of War (Tiles)**: Visible vs. explored Tiles werden über zwei Sets
  geführt; nicht-sichtbare Tiles werden in `updateFog` einfach mit einem
  abgedunkelten Vierviereck überzeichnet, das die Höhenform übernimmt.
- **Fußspuren**: Footprints sind autoritativ vom Server, der Client malt sie
  nur und lässt sie über `FOOTPRINT_LIFETIME_TICKS = 25 s` ausbleichen.

### Eingabe

Maus + Tastatur und Touch werden parallel unterstützt. Die Logik ist in
`onPointerDown/Move/Up` und den Touch-Pendants `onTouchDown/Move/Up`.

- **Boxauswahl** — Linksklick + Ziehen ab 8 px Schwelle.
- **Einzelauswahl** — Linksklick auf eine eigene Einheit.
- **Kommando** — Rechtsklick (Maus) oder Tippen ohne Wischen (Touch). Je nach
  Ziel-Tile wird `move` / `harvest` / `hunt` gesendet. Touch-Tippen befiehlt
  immer den **gesamten** Stamm.
- **WASD** / **Pfeiltasten** — schickt alle 0,4 s einen `move`-Befehl mit dem Stammeszentrum
  +`stepDist=8` Tiles in die gewählte Iso-Richtung.

## Netzwerkprotokoll

Definiert in [`shared/protocol.ts`](../shared/protocol.ts). Alle Nachrichten
sind JSON über WebSocket.

### Server → Client

| `type` | Wann | Inhalt |
|---|---|---|
| `init` | direkt nach `join` | `playerId`, `seed`, aktueller `tick`, alle `units`, bereits `removedObjects`, eigener `spawn`, `resources[]` aller Spieler, `names[]`, `footprints[]`, sichtbare `animals` |
| `state` | jeden Tick | `tick`, alle `units`, `resources[]`, neu entstandene/respawnte Objekte, neue `footprints`, sichtbare `animals`, `removedAnimalIds`, `deadUnitIds` |
| `opponentJoined` | Spieler connected | `playerId`, `name`, dessen neue Einheiten |
| `opponentLeft` | Spieler getrennt | `playerId`, IDs der entfernten Einheiten |
| `error` | Welt voll, JSON kaputt etc. | `message` |

### Client → Server

| `type` | Felder | Wirkung |
|---|---|---|
| `join` | `name` | Slot belegen (verworfen wenn schon belegt oder Welt voll) |
| `move` | `unitIds`, `i`, `j` | Pfad zur Tile-Position, weicht auf nächsten freien Tile aus |
| `harvest` | `unitIds`, `i`, `j` | Bewegt zur Ressource, sammelt periodisch (s. Gameplay-Doku) |
| `hunt` | `unitIds`, `animalId` | Bewegt zum Tier, schlägt zu sobald in Reichweite |

`MoveCommand`/`HarvestCommand`/`HuntCommand` filtern serverseitig auf
`u.owner === slot.id` — fremde Einheiten lassen sich also nicht steuern.

## Worldgen

[`shared/worldgen.ts`](../shared/worldgen.ts) ist deterministisch und
seitenfrei (keine globalen Zustände außer einem optionalen Spawn-Cache).

- **Hash** `hash3(seed, i, j)` — 32-bit Mulberry-ähnlich, daraus baut sich
  Tile-Variation, Decor und das per-Tile-RNG.
- **Höhe** `elevationAt` (4-Octave-fBm) → klassifiziert in Wasser/Felsen/Gebirge.
- **Biom** wird aus Höhe + Temperatur (`fbm`) + Feuchtigkeit (`fbm`) +
  Flusslinien-Maske bestimmt; Spawnpunkte haben einen `SPAWN_GUARD_RADIUS`,
  der zu „Wiese ohne Bäume“ erzwungen wird, damit Anfänger nicht in einem
  Wald spawnen.
- **Spawns** — `spawnsFromSeed(seed)` erzeugt 10 Spawnpunkte per
  Poisson-Disk-artigem Sampling mit Mindestabstand `SPAWN_DISTANCE_MIN = 22`.
- **Objekte** (`hasTreeAt`, `hasBushAt`, `hasMushroomAt`, `hasFishAt`,
  `hasStoneAt`) prüfen Biom + Hash-Schwelle. Reihenfolge ist fix
  (Tree → Bush → Mushroom → Fish → Stone), damit ein Tile höchstens eines
  davon trägt.

## Pathfinding

[`shared/pathfinding.ts`](../shared/pathfinding.ts) implementiert ein
schlichtes A* auf dem Tile-Grid mit Diagonal-Heuristik. Die Walkability wird
als Callback übergeben, sodass dieselbe Routine sowohl Einheiten- als auch
Tier-Pfade plant. Beide Seiten dürfen `blocked: Set<string>` mitgeben, damit
Mehrfach-Selektionen sich nicht auf dieselben Ziel-Tiles beißen.

## Tickrate, Determinismus, Reconciliation

Es gibt **keine** Client-Side-Prediction: Bewegungen geschehen erst, wenn der
Server den nächsten `state`-Snapshot schickt, und der Client interpoliert
linear zwischen zwei Snapshots. Das ist im LAN/Server-nahen Setup unauffällig
und vermeidet einen ganzen Stapel an Sync-Code.

Da die statische Welt deterministisch ist, brauchen Welt-Snapshots nur Diffs:
„diese Tiles sind abgebaut“, „diese sind nachgewachsen“, „neue Footprints“.
Die Live-Entitäten (Einheiten, Tiere, Ressourcen) gehen pro Tick als
Volltext-Snapshot raus — bei kleiner Welt und 10 Spielern ist das OK; sollte
das mal nicht reichen, ist hier der nächstliegende Optimierungspunkt
(Delta-Encoding pro Einheit).
