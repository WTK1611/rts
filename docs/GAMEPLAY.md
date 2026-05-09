# Gameplay

Diese Doku beschreibt die Spielmechanik, wie sie aktuell in
[`server/sim.ts`](../server/sim.ts) und [`shared/worldgen.ts`](../shared/worldgen.ts)
implementiert ist. Die Konstantennamen entsprechen denen im Code, sodass sich
Werte direkt nachvollziehen und ändern lassen.

## Stamm und Spawn

- Jeder Spieler steuert einen Stamm aus `TRIBE_SIZE = 4` Einheiten.
- Spawnpunkte sind deterministisch aus dem Seed: `spawnsFromSeed(seed)` erzeugt
  zehn Punkte mit Mindestabstand `SPAWN_DISTANCE_MIN = 22` Tiles.
- Im Umkreis von `SPAWN_GUARD_RADIUS = 3` um jeden Spawn ist das Biom auf
  „Wiesen“ gezwungen und es spawnen keine Objekte — der Stamm hat also
  garantiert Bewegungsraum.
- Jeder Slot bekommt eine feste Farbe aus `PLAYER_COLORS[id]`.

## Bedienung im Detail

### Maus + Tastatur

| Eingabe | Wirkung |
|---|---|
| Linksklick auf Einheit | Einzelauswahl |
| Linksklick + Ziehen | Boxauswahl (alle eigenen Einheiten in der Box) |
| Rechtsklick auf Boden | Bewegen (`move`) |
| Rechtsklick auf Tier | Jagen (`hunt`) |
| Rechtsklick auf Ressource | Sammeln (`harvest`) |
| **WASD** / **Pfeiltasten** | Stamm in iso-Richtung schieben (alle 0,4 s ein Move-Befehl) |
| Mausrad | Zoom (0,5×–2,5×) |
| Mauszeiger an Bildschirmrand | Edge-Pan |
| **M** | Minimap ein/aus |

Ist beim Rechtsklick mindestens eine Einheit selektiert, gehen die Befehle nur
an die Selektion. Ohne Selektion macht WASD den ganzen Stamm bewegungsbereit.

### Touch (Smartphone/Tablet)

| Eingabe | Wirkung |
|---|---|
| Tippen auf Boden / Ressource / Tier | Befiehlt **alle** eigenen Einheiten |
| Wischen | Kamera schwenken |
| Pinch | Zoom |

Auf Touch-Geräten ist die Minimap per Default ausgeblendet (zu klein zum
treffen).

## Welt

### Biome

Jedes Tile gehört zu einem Biom (siehe [`worldgen.ts`](../shared/worldgen.ts)):

| Biom | Begehbar | Bemerkenswert |
|---|---|---|
| `wiesen` | ja | trägt Beerenbüsche und Pilze |
| `wald` | ja | dichte Bäume + Pilze |
| `savanne` | ja | wenige Bäume, viele Tiere |
| `wueste` | ja | sehr trocken, mehr Stein |
| `felsen` | ja | erhöhtes Plateau, Stein |
| `lake` / `river` | nein | trinkbar vom Ufer aus, Fische am Ufer |
| `gebirge` | nein | unpassierbar |
| `canyon` | ja | tiefer eingeschnitten, optisch markant |

Biome werden aus Höhe + Temperatur + Feuchtigkeit + einer Flusslinien-Maske
bestimmt. Hohe Tiles (`elev > 0,72`) werden zu Felsen, sehr hohe (`> 0,85`) zu
Gebirge.

### Höhenkarte

Pro Biom gibt es ein `HeightProfile { base, hill }`. Die finale Höhe ist
`base + fbm * hill`, geclampt auf `MAX_TERRAIN_HEIGHT_PX = 76 px`. Wasser hat
Höhe 0; Canyons gehen ins Negative (`base = -22`). Sicht- und Pfad-Logik
ignorieren die Höhe — sie ist rein optisch und für die Nebel-/Schattenform
relevant.

### Sichtweite & Fog of War

- Jede eigene Einheit erhellt einen Kreis mit Radius `SIGHT_RADIUS = 5,5` Tiles.
- Bereits gesehene (aber jetzt nicht sichtbare) Tiles bleiben im
  „explored“-Set und werden grau abgedunkelt.
- Tiere sind serverseitig gefoggt: nur sichtbar im Radius `ANIMAL_VIEW_RADIUS = 10`
  einer eigenen Einheit.

## Ressourcen

Es gibt sieben Ressourcen, definiert in
[`shared/protocol.ts`](../shared/protocol.ts):

| Ressource | Quelle | Auto-Sammeln beim Drüberlaufen | Aktiv-Sammeln (`harvest`) |
|---|---|---|---|
| `holz` | Bäume | +1 (alle 120 s respawn) | +5 pro Tick (1,2 s), Baum hält ~`treeWoodAt` Wood |
| `beeren` | Beerenbüsche | +1 (90 s respawn) | +3 pro Tick |
| `pilze` | Pilze | +1 (90 s respawn) | +1 pro Tick |
| `stein` | Felsbrocken | +1 (kein Respawn) | +2 pro Tick |
| `fisch` | Fische in Lake/Fluss | +1 wenn Tile am Ufer (kein Respawn) | +1 pro Tick |
| `wasser` | See/Fluss | +1 wenn Tile am Ufer | nicht aktiv abbaubar |
| `fleisch` | erlegte Tiere | — | siehe Jagd |

„Auto-Sammeln“ heißt: Wenn eine Einheit über ein Tile mit Ressource oder am
Ufer eines Tiles vorbei läuft, bekommt der Stamm 1 Einheit der jeweiligen
Ressource gutgeschrieben (`tryAutoPick`). Das passiert genau einmal pro
betretenem Tile — mit Footprint-Logik gekoppelt.

`harvest` hingegen befiehlt einer Einheit, neben das Objekt zu laufen und es
über mehrere Ticks abzubauen, bis der Tile-Vorrat aus
`treeWoodAt`/`bushBerriesAt`/etc. aufgebraucht ist.

### Regrow

Bäume, Büsche, Pilze respawnen nach `*_REGROW_TICKS` (90 s bzw. 120 s).
Stein und Fisch respawnen aktuell nicht.

## HP, Hunger, Heilung

Jede Einheit hat `hpMax = 100` HP. Sie verliert HP durch:

- `UNIT_HP_LOSS_PER_TILE = 0,2` pro betretenem Tile (also Bewegung kostet HP),
- `UNIT_HP_LOSS_PER_SEC_IDLE = 0,12` pro Sekunde stehend (langsamer Hunger),
- Tier-Angriffe (`spec.damage`).

Alle `EAT_INTERVAL = 1 s` versucht jede Einheit, sich automatisch zu heilen,
indem sie aus dem Stamm-Vorrat eine Ressource isst. Reihenfolge:

1. Fleisch (+15 HP)
2. Fisch (+12 HP)
3. Pilze (+2 HP)
4. Beeren (+3 HP)
5. Wasser (+1 HP)

Wenn eine Einheit auf 0 HP fällt, stirbt sie und verschwindet (`deadUnitIds`).
Stirbt der gesamte Stamm, ist das Spiel vorbei (Game-Over-Screen mit
Statistik).

## Tiere

Definiert in `ANIMAL_SPECS` in [`server/sim.ts`](../server/sim.ts).

| Tier | HP | Tempo | Fleisch | Aggressiv | Schaden | Auto-jagd. |
|---|---|---|---|---|---|---|
| Hase (`hare`) | 3 | 4,0 | 2 | nein | 0 | ja, R = 6 |
| Rentier (`reindeer`) | 8 | 3,0 | 6 | nein | 0 | ja, R = 5 |
| Riesenhirsch (`megaloceros`) | 15 | 3,4 | 10 | nein | 0 | ja, R = 5 |
| Bison (`bison`) | 18 | 2,6 | 12 | **ja**, R = 4 | 4 | nein |
| Höhlenlöwe (`caveLion`) | 12 | 4,0 | 6 | **ja**, R = 7 | 5 | nein |
| Mammut (`mammoth`) | 30 | 1,8 | 25 | **ja**, R = 3 | 10 | nein |

### Auto-Jagd

Einheiten ohne Befehl scannen alle 0,5 s ihre Umgebung. Tiere mit
`autoHuntable: true` (Hase, Rentier, Riesenhirsch) werden automatisch
angegriffen, wenn sie näher als `autoHuntRange` sind. Aggressive Tiere werden
nicht von selbst angegriffen — die müssen die Spieler:innen explizit per
`hunt` befehlen, damit sich nicht versehentlich der ganze Stamm an einem
Mammut verausgabt.

### Aggro & Gruppenjagd

- Aggressive Tiere greifen die nächste Einheit an, sobald sie im
  `detectRange` ist. Der Aggro hält `aggroDurationSec` an oder bis das Ziel
  außer dem `1,8 ×`-fachen `detectRange` rauskommt.
- Bei Treffern auf eine Einheit ruft die Sim Allies im Radius
  `GROUP_FIGHT_RANGE = 7` als Verstärkung — sie schalten auf das gleiche
  `huntTarget` (`callForHelp`).
- Auch andersrum: Greift eine eigene Einheit ein Tier an, ziehen freie Allies
  in der Nähe nach (`rallyAlliesToHunt`).

### Jagd-Mechanik

`HUNT_INTERVAL = 0,9 s`, `HUNT_DAMAGE = 2`, Reichweite `HUNT_RANGE = 1,5`. Wer
in Reichweite ist, schlägt zu; ein Pfad zum Ziel wird laufend neu geplant,
falls das Tier sich bewegt. Beim Tod des Tiers gibt es `spec.meat` Fleisch
gutgeschrieben.

## Footprints

Beim Betreten eines neuen Tiles hinterlässt eine Einheit eine Footprint mit
TTL `FOOTPRINT_LIFETIME_TICKS = 25 s × Tickrate`. Footprints sind autoritativ
vom Server (`Sim.footprints`) und für alle Spieler sichtbar — gut um
Konkurrenten zu spuren, aber sie verblassen schnell.

## Game-Over

Wenn der eigene Stamm vollständig ausgelöscht ist, blendet der Client
`#gameover` ein, mit Spielzeit, anfänglicher Stammesgröße und Endbestand der
Ressourcen. Der Server-Slot wird beim Disconnect freigegeben — bei Reload
spawnt der Spieler an einem neuen Slot mit frischem Stamm.

## Was es (noch) nicht gibt

- Keine Gebäude/Tech-Tree.
- Kein direktes PvP zwischen Stämmen — andere Spieler:innen lassen sich nicht
  angreifen.
- Keine Persistenz: Server-Restart = neue Welt, neuer Seed.
- Keine Crafting-Rezepte für Stein/Holz.

Diese Lücken sind die offensichtlichsten Stellen, an denen sich das Projekt
weiterbauen lässt.
