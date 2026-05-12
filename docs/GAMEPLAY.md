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

Es gibt neun Ressourcen, definiert in
[`shared/protocol.ts`](../shared/protocol.ts) (`holz`, `wasser`, `beeren`,
`pilze`, `fleisch`, `fisch`, `stein`, `kreuter`, `felle`). Alle Werte sind
über [`server/balancing.ts`](../server/balancing.ts) zur Laufzeit
überschreibbar.

| Ressource | Quelle | Auto-Sammeln (`harvest.*Autopick`) | Aktiv-Sammeln (`harvest.*Amount`, alle `1,2 s`) |
|---|---|---|---|
| `holz` | Bäume (4 Wachstumsstadien) | +1 pro betretenem Tile | +5 pro Tick |
| `beeren` | Beerenbüsche (nur Sommer/Herbst) | +1 | +3 pro Tick |
| `pilze` | Pilze (nur Sommer/Herbst, Yield Sommer ×0,5 / Herbst ×1,5) | +1 | +1 pro Tick |
| `stein` | Felsbrocken | +1 | +2 pro Tick |
| `kreuter` | Kräuter (Frühling ×1,5 / Sommer ×1 / Herbst ×0,5, kein Winter) | +1 | +1 pro Tick (Heilung +35 HP) |
| `fisch` | Fische in Lake/Fluss | +1 wenn Tile am Ufer | +1 pro Tick (Winter/Frühling ×0,5) |
| `wasser` | See/Fluss | +1 wenn Tile am Ufer | nicht aktiv abbaubar |
| `fleisch` | erlegte Tiere | — | siehe Jagd |
| `kaktus` | Kakteen in der Wüste | +1 Holz + 1 Wasser | +1 H/+1 W pro Tick |
| `felle` | reserviert | — | — (noch nicht produziert) |

„Auto-Sammeln" heißt: Wenn eine Einheit über ein Tile mit Ressource oder am
Ufer eines Tiles vorbei läuft, bekommt der Stamm 1 Einheit der jeweiligen
Ressource gutgeschrieben (`tryAutoPick`). Das passiert genau einmal pro
betretenem Tile — mit Footprint-Logik gekoppelt.

`harvest` hingegen befiehlt einer Einheit, neben das Objekt zu laufen und es
über mehrere Ticks abzubauen.

### Regrow (Standardwerte aus [`balancing.ts`](../server/balancing.ts))

| Objekt | Respawn | Bemerkung |
|---|---|---|
| Baum | **1200 s** | 4 Stadien × `D.treeStageTicks` (300 s) — Sämling → erntereif |
| Busch | 120 s | nur in Sommer/Herbst tragend |
| Pilz | 60 s | nur in Sommer/Herbst |
| Kaktus | 180 s | |
| Kräuter | 300 s | |
| Stein | 600 s | Respawn der gleichen Tile-Position |
| Fisch | nicht implementiert | über Reproduktion lebender Fische |

Saisonal: Herbst-Regrow ×0,6 (`seasonRegrowMultiplier`).

## HP, Hunger, Heilung

Jede Einheit hat `unit.hpMax = 100` HP. Sie verliert HP durch:

- `unit.hpLossPerTile = 0,4` pro betretenem Tile (also Bewegung kostet HP),
- `unit.hpLossPerSecIdle = 0,12` pro Sekunde stehend (Stoffwechsel),
- Tier-Angriffe (`animal.<kind>.damage`),
- Verdursten: Drain = `hpMax / Tageslänge` pro Sekunde, sobald `wasser ≤ 0`,
- Katastrophen (Beben, Flut, Vulkan, Meteor, Blitz, Sturm; siehe unten).

Alle `eat.intervalSec = 1 s` versucht jede Einheit, sich automatisch zu
heilen, sobald HP unter `eat.autoeatHpThreshold = 51 %` fällt. Reihenfolge:

1. Kräuter (+35 HP)
2. Fleisch (+15 HP)
3. Fisch (+12 HP)
4. Pilze (+2 HP)
5. Beeren (+3 HP)

Wasser heilt **nicht** und wird über `consumeWater` separat verbraucht
(`eat.waterPerUnitPerDay = 1`, saisonal moduliert). Am Lagerfeuer regeneriert
die Einheit zusätzlich `fire.hpRegenPerSec × 1,5` HP/s, ohne Vorrat zu
verbrauchen.

Wenn eine Einheit auf 0 HP fällt, stirbt sie und verschwindet (`deadUnitIds`).
Stirbt der gesamte Stamm, ist das Spiel vorbei (Game-Over-Screen mit
Statistik).

## Tiere

Werte aus [`server/balancing.ts`](../server/balancing.ts) (`ANIMAL_DEFAULTS`).
Aggressiv = `detectRange > 0`, Auto-jagd. = `autoHuntRange > 0`.

| Tier | HP | Tempo | Fleisch | Schaden | Aggro (R) | Auto-jagd. (R) | Biome |
|---|---|---|---|---|---|---|---|
| Hase (`hare`) | 3 | 4,0 | 2 | 0 | – | 6 | Wiesen / Wald / Savanne |
| Rentier (`reindeer`) | 8 | 3,0 | 6 | 0 | – | 5 | Wiesen / Wald |
| Riesenhirsch (`megaloceros`) | 15 | 3,4 | 10 | 0 | – | 5 | Wald / Wiesen |
| Bison (`bison`) | 18 | 2,6 | 12 | 4 | 4 | – | Savanne / Wiesen / Wüste |
| Höhlenlöwe (`caveLion`) | 12 | 4,0 | 6 | 5 (+5 Beute-DMG) | 5 | – | Felsen / Wüste / Savanne |
| Mammut (`mammoth`) | 30 | 1,8 | 25 | 10 | 4 | – | Wiesen / Savanne / Wüste |
| Alligator (`alligator`) | 14 | 2,6 | 8 | 6 (+6 Beute-DMG) | 5 | 5 | Lake / River (Amphibie R=3) |
| Bär (`bear`) | 22 | 3,0 | 14 | 8 (+7 Beute-DMG) | 6 | – | Wald / Felsen |

Brut: jede Art hat eigene `matureAgeSec` / `gestationSec` / `maxAgeSec`.
Spawn-Dichte je Art über `density`; saisonaler Multiplikator
Frühling 0,8× / Sommer 1× / Herbst 1,8× / Winter 0,5×.

### Auto-Jagd

Einheiten ohne Befehl scannen alle `hunt.scanIntervalSec = 0,5 s` ihre
Umgebung. Tiere mit `autoHuntRange > 0` (Hase, Rentier, Riesenhirsch,
Alligator) werden automatisch angegriffen, wenn sie näher als `autoHuntRange`
sind. Aggressive Tiere werden nicht von selbst angegriffen — die müssen die
Spieler:innen explizit per `hunt` befehlen, damit sich nicht versehentlich
der ganze Stamm an einem Mammut verausgabt.

### Nachts

Räuber (Höhlenlöwe, Mammut, Bär, Alligator) erhalten Boni:

- Sichtweite ×`hunt.nightPredatorDetectMult = 1,6`,
- Aggro-Dauer ×`hunt.nightPredatorAggroDurMult = 1,4`,
- Schaden ×`hunt.nightPredatorDamageMult = 1,25`.

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

`hunt.intervalSec = 0,9 s`, Reichweite `hunt.range = 1,5`. Waffenschaden:
Faust 2, Stein 3, Keule 4, Speer 5. Wer in Reichweite ist, schlägt zu; ein
Pfad zum Ziel wird laufend neu geplant, falls das Tier sich bewegt. Beim Tod
des Tiers gibt es `animal.<kind>.meat` Fleisch gutgeschrieben.

Beute flieht ab `hunt.preyFleeRange = 6` mit `hunt.preyFleeRepathSec = 0,8 s`
Repath-Cadence. Aggro hält bis das Ziel über `hunt.animalEscapeRangeMult ×
detectRange` herauskommt.

## Tag/Nacht & Jahreszeiten

Ein voller Tag dauert standardmäßig 240 s = Morgen 50 + Mittag 30 +
Nachmittag 40 + Nacht 120 (`day.*LenSec`). Die Saison moduliert die
Nachtlänge: Sommer ×0,5, Winter ×1,6 (mit 10/90 % Sicherheits-Clamp),
Frühling/Herbst ×1.

Jahreszeit-Zyklus (siehe `seasonAt` in
[`shared/protocol.ts`](../shared/protocol.ts)): Frühling → Sommer → Herbst
→ Winter, je `SEASON_LEN_DAYS = 4` Tage, ein Jahr = 16 Tage. Saisonale
Multiplikatoren betreffen Tier-Spawn, Pflanzen-Regrow + Yield, Fisch-Fang,
Wasserverbrauch (Sommer ×1,6, Winter ×0,8) sowie Verfügbarkeit von Beeren,
Pilzen und Kräutern.

## Katastrophen

Zu Beginn jedes neuen Tages würfelt der Server pro Katastrophen-Typ einmal
mit saisonaler Wahrscheinlichkeit (`CATASTROPHE_DAILY_CHANCE` in
[`shared/protocol.ts`](../shared/protocol.ts)). Schweregrad: 1 / 2 / 3,
ungefähr verteilt 65 / 27 / 8 %. Während der ersten Spieltage greift ein
Schonzeit-Guard, danach kann pro Tag insgesamt **höchstens eine**
Katastrophe ausgelöst werden (Cap, um Tag-Pile-Ups zu vermeiden).

| Typ | Effekt (Auszug) |
|---|---|
| `quake` | AoE-Schaden, zerstört Vegetation, öffnet permanente `crack`-Tiles, löscht Lagerfeuer |
| `flood` | Senken werden zu `flood`-Tiles (unbegehbar, zerstört Büsche/Pilze/Kräuter) |
| `drought` | Wasserverbrauch ×(1 + 0,25·sev), kleine Seen trocknen aus |
| `freeze` | Wasser → `ice` (begehbar, nicht trinkbar), Stoffwechsel-Multiplikator |
| `meteor` | Vorwarnzeit ~6 s, dann massiver AoE-Schaden + Asche-Krater |
| `eruption` | Lava-Tiles (permanent), löst potentiell `wildfire` aus |
| `wildfire` | breitet sich Tile-für-Tile über Baum-Nachbarn aus |
| `storm` | wandernder Sturm, Sichteinschränkung + Bewegungsstrafe |
| `lightning` | punktueller Treffer, entzündet Bäume → Wildfire |
| `locusts` | wandernder Schwarm, vernichtet Beeren/Pilze/Kräuter im Pfad |
| `landslide` | Tile-Spur, schweben Steine + Schaden entlang des Pfads |

## Footprints

Beim Betreten eines neuen Tiles hinterlässt eine Einheit eine Footprint mit
TTL `FOOTPRINT_LIFETIME_TICKS = 25 s × Tickrate`. Footprints sind autoritativ
vom Server (`Sim.footprints`) und für alle Spieler sichtbar — gut um
Konkurrenten zu spuren, aber sie verblassen schnell.

## Mythische Artefakte

Auf der Karte sind ca. 10 mythische Artefakte verteilt (Stonehenge, Steinkreis,
Monolith) — deterministisch aus dem Seed (`artifactsFromSeed` in
`shared/worldgen.ts`). Sie liegen abseits der Spawns (≥ 18 Tiles) und mindestens
36 Tiles voneinander entfernt. Solange ein Artefakt noch nicht entdeckt ist,
pulsiert ein goldener Glow um es herum.

Sobald sich eine Einheit innerhalb von `ARTIFACT_DISCOVERY_RADIUS = 4` Tiles
nähert, gilt das Artefakt als „entdeckt" — der Stamm dieser Einheit erhält eine
Belohnung. Pro Artefakt wird die Belohnung zyklisch aus dieser Liste gezogen:

| Belohnung           | Effekt                                                            |
|---------------------|-------------------------------------------------------------------|
| `newMember`         | Spawnt ein neues Stammesmitglied am Artefakt (fällt auf 50 Fleisch zurück, wenn der Stamm voll ist) |
| `fleisch` (50)      | +50 Fleisch                                                       |
| `fisch` (50)        | +50 Fisch                                                         |
| `beeren` (100)      | +100 Beeren                                                       |
| `pilze` (200)       | +200 Pilze                                                        |

Der Fund wird allen Spielern als Toast (`.toast.artifact`, gold) angezeigt —
mit Nennung des findenden Stammes und der konkreten Belohnung. Jedes Artefakt
kann nur einmal entdeckt werden.

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
- `felle` ist als Ressource definiert (Cap 3/Person), wird aber aktuell weder
  produziert noch konsumiert — reserviert für künftige Mechanik.

Diese Lücken sind die offensichtlichsten Stellen, an denen sich das Projekt
weiterbauen lässt.
