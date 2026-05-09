# Soziale Regeln der Stämme

Quelle: [`server/sim.ts`](../server/sim.ts), [`server/aiBot.ts`](../server/aiBot.ts),
[`shared/protocol.ts`](../shared/protocol.ts), [`shared/names.ts`](../shared/names.ts).
Werte sind die aktuellen Konstanten zum Zeitpunkt dieses Dokuments.

## Stammesgröße & Start

- **Startgröße:** 4 Einheiten. Geschlechter sind fest: `m, f, m, f`
  ([`sim.ts:44`](../server/sim.ts#L44), [`sim.ts:702-731`](../server/sim.ts#L702-L731)).
- **Maximale Stammesgröße:** 12 Einheiten (`MAX_TRIBE_SIZE`,
  [`protocol.ts:3`](../shared/protocol.ts#L3)).
- **Start-Alter:** alle Startmitglieder sind erwachsen (`CHILD_AGE_SEC + Jitter ≤ 180s`,
  [`sim.ts:724`](../server/sim.ts#L724)).
- **Sprache des Stamms:** wird beim Beitritt aus Seed + Slot abgeleitet oder explizit
  gesetzt; Namen werden pro Sprache gewählt
  ([`sim.ts:692`](../server/sim.ts#L692), [`shared/names.ts`](../shared/names.ts)).

## Lebenszyklus einer Einheit

- **HP-Grenze:** 100. Volle HP zu Spielbeginn ([`sim.ts:92`](../server/sim.ts#L92)).
- **HP-Verlust:**
  - `0,2 HP` pro begangener Tile-Distanz ([`sim.ts:93`](../server/sim.ts#L93)).
  - `0,12 HP/s` im Idle (Stoffwechsel, [`sim.ts:94`](../server/sim.ts#L94)).
- **Essen** alle `1,0 s`, sofern Vorrat im Stamm vorhanden
  ([`sim.ts:95`](../server/sim.ts#L95), [`sim.ts:1136`](../server/sim.ts#L1136)).
  Die HP-Gewinne pro Ressource ([`sim.ts:96-100`](../server/sim.ts#L96-L100)):

  | Ressource | HP-Gewinn |
  |---|---|
  | Fleisch | 15 |
  | Fisch | 12 |
  | Beeren | 3 |
  | Pilze | 2 |
  | Wasser | 1 |

- **Altern:** `ageSec` läuft mit der Zeit hoch. Erreicht eine Einheit
  `MAX_AGE_SEC = 420 s` (7 Min), stirbt sie sofort
  ([`sim.ts:89`](../server/sim.ts#L89), [`sim.ts:1140-1141`](../server/sim.ts#L1140-L1141)).
- **Tod:** HP ≤ 0 → Einheit wird im Tick-Reaper entfernt
  ([`sim.ts:1455-1462`](../server/sim.ts#L1455-L1462)).

## Häuptling (`isChief`)

- Pro Stamm gibt es **genau einen** Häuptling
  ([`sim.ts:1427-1453`](../server/sim.ts#L1427-L1453)).
- **Auswahl:** ältester Mann; gibt es keinen Mann, die älteste Frau.
- Wird der Häuptling übertragen oder stirbt, wird in `updateChiefs` ein neuer bestimmt.
- Beim Frauen-Transfer im Treffen verliert die transferierte Einheit ihren Chief-Status
  ([`sim.ts:1299`](../server/sim.ts#L1299)).

## Innerstämmische Wachstum (Geburt)

In [`growthCheck`](../server/sim.ts#L1333):

- **Voraussetzungen pro Tick:**
  - Stamm hat ≥ 2 Mitglieder, < `MAX_TRIBE_SIZE`,
  - mindestens 1 Mann **und** 1 Frau anwesend.
- **Timer:** `growthTimer[p]` läuft hoch; sind die Bedingungen erfüllt, ist
  `growthActive[p] = true`. Sobald `growthTimer ≥ GROWTH_REQUIRED_SEC = 120 s`
  ([`sim.ts:46`](../server/sim.ts#L46)) wird ein neues Mitglied **am Stammeszentrum**
  gespawnt ([`sim.ts:1361`](../server/sim.ts#L1361)).
- **Reset:** Bedingungen verletzt → Timer und Active-Flag werden auf 0 gesetzt
  ([`sim.ts:1352-1356`](../server/sim.ts#L1352-L1356)).
- **Geschlecht des Neugeborenen:** zufällig 50/50 (deterministisch aus Seed,
  [`sim.ts:1397-1398`](../server/sim.ts#L1397-L1398)).
- **Name:** aus der Sprache des Stamms ([`sim.ts:1420`](../server/sim.ts#L1420)).
- **Start-Alter:** `0 s`. Das Neugeborene ist also Kind, bis `ageSec ≥ CHILD_AGE_SEC = 60 s`.

## Treffen zweier Stämme: Mitgliederaustausch

Logik in [`encounterCheck`](../server/sim.ts#L1194), läuft **jeden Tick**.

1. **Begegnung:** Mindestens **eine** Einheit aus Stamm A und **eine** Einheit aus
   Stamm B befinden sich im Abstand ≤ `ENCOUNTER_RANGE = 5` Tiles
   ([`sim.ts:47`](../server/sim.ts#L47), [`sim.ts:1210-1219`](../server/sim.ts#L1210-L1219)).
   Es genügt ein einzelnes Paar — der ganze Stamm muss nicht zusammen sein.
2. **Cooldown:** Pro Stamm-Paar wird das Treffen nur alle `60 s` ausgewertet
   (`ENCOUNTER_COOLDOWN_TICKS`, [`sim.ts:48`](../server/sim.ts#L48)).
3. **Geschlechter-Bilanz** ([`sim.ts:1250-1259`](../server/sim.ts#L1250-L1259)):
   - `paired = min(männer, frauen)`,
   - `surplusM = männer − paired`, `surplusF = frauen − paired`.
4. **Transferregel** — es wandern **nur Frauen** und nur in **eine** Richtung:
   - A hat Frauen-Überschuss **und** B hat Männer-Überschuss
     → `n = min(sA.surplusF, sB.surplusM, MAX_TRIBE_SIZE − |B|)` Frauen wandern A → B.
   - Spiegelfall (A männer-, B frauen-überschüssig) → Frauen wandern B → A.
   - Beide bereits ausgewogen → kein Transfer.
   - Implementierung: [`transferWomenForBalance`](../server/sim.ts#L1248).
5. **Beim Transfer** verliert die Frau ihren Path, Harvest-/Hunt-Target,
   Chief-Status, bekommt die Farbe des neuen Stamms und steht idle
   ([`sim.ts:1286-1302`](../server/sim.ts#L1286-L1302)).
6. **Geburten-Bonus:** Direkt danach wird für **beide** Stämme `tryFreeBirth` geprüft
   ([`sim.ts:1238-1239`](../server/sim.ts#L1238-L1239),
   [`sim.ts:1310-1325`](../server/sim.ts#L1310-L1325)). Hat der Stamm mindestens 2 Mitglieder,
   ≥ 1 m und ≥ 1 f, und Platz unter `MAX_TRIBE_SIZE`, wird sofort ein Neugeborenes
   am Stammeszentrum gespawnt — **ohne** Warten auf den Growth-Timer.
7. **Toast-Event** wird emittiert (Treffen + transferierte Anzahl + neue Geburten,
   [`sim.ts:1240-1244`](../server/sim.ts#L1240-L1244)).

### Konsequenzen für kleine Stämme

- **Letzte Einheit weiblich:** Trifft sie auf einen Stamm mit Männer-Überschuss, wird
  sie übergeben → eigener Stamm ist leer und stirbt aus.
- **Letzte Einheit männlich:** Es können nur Frauen *zu* dir wandern, nie weg.
  Ein Treffen kann den eigenen Stamm in dem Fall nur vergrößern.
- Volle Stämme (`|Stamm| = MAX_TRIBE_SIZE`) nehmen keine weiteren Frauen auf.

## Lagerfeuer

Logik in [`campfireStep`](../server/sim.ts) — Konstanten am Datei-Anfang:

- `CAMPFIRE_IGNITE_DELAY_SEC = 8` — wie lange ein Stamm ruhig zusammenstehen muss.
- `CAMPFIRE_IGNITE_MIN_UNITS = 2` — mindestens zwei Stammesmitglieder im Cluster.
- `CAMPFIRE_IGNITE_CLUSTER_RADIUS = 2,5` Tiles — Clusterradius um den Schwerpunkt.
- `CAMPFIRE_RANGE = 2,5` Tiles — Heil-/Schutzradius um das Feuer.
- `CAMPFIRE_BURN_PER_FUEL_SEC = 25` — Brenndauer je Brennstoff-Paar (1 Holz + 1 Stein).
- `CAMPFIRE_HP_REGEN_PER_SEC = 1,2` — Heilung pro Sekunde am Feuer.

### Entzünden

- Pro Stamm gibt es **maximal ein** Lagerfeuer.
- Stehen ≥ 2 Mitglieder eines Stamms ohne Bewegung, Harvest- oder Hunt-Ziel
  innerhalb des Clusterradius zusammen, läuft ein Ignite-Timer.
- Verlässt der Cluster die Position oder fällt unter zwei Mitglieder, wird der
  Timer zurückgesetzt.
- Erreicht der Timer `CAMPFIRE_IGNITE_DELAY_SEC` und der Stamm hat ≥ 1 Holz und
  ≥ 1 Stein im Vorrat, wird das Feuer am Cluster-Schwerpunkt entzündet:
  - 1 Holz und 1 Stein werden verbraucht.
  - Brennstoff-Timer startet bei `CAMPFIRE_BURN_PER_FUEL_SEC`.

### Brennen, Nachlegen, Erlöschen

- Pro Tick zählt der Brennstoff-Timer dt herunter.
- Läuft er ab, wird **nur dann** nachgelegt, wenn mindestens eine eigene Einheit
  innerhalb von `CAMPFIRE_RANGE` steht **und** der Stamm noch 1 Holz + 1 Stein
  hat. Dann werden Holz und Stein verbraucht und der Timer wieder aufgefüllt.
- Andernfalls erlischt das Feuer.

### Wirkung am Feuer

Befindet sich eine Einheit innerhalb von `CAMPFIRE_RANGE` zum eigenen Lagerfeuer:

- **Kein Idle-HP-Verfall** (`UNIT_HP_LOSS_PER_SEC_IDLE` greift nicht).
- **Heilung** mit `CAMPFIRE_HP_REGEN_PER_SEC` HP/s, ohne Vorrat zu verbrauchen.

Die normale `autoEat`-Logik läuft weiter, greift aber nur, wenn `hp < hpMax` —
durch die stete Regeneration sind Einheiten am Feuer fast immer voll und essen
in der Praxis nichts. Bewegt sich eine Einheit aus dem Radius, gilt sofort
wieder normaler Stoffwechsel.

## Aussterben

- Erkannt im Reaper: war `before[p] > 0` und ist `after[p] === 0`, gilt der Stamm
  als ausgestorben ([`sim.ts:1455-1471`](../server/sim.ts#L1455-L1471)).
- Wird via `consumeExtinctTribes` an den Client gemeldet
  ([`sim.ts:267-269`](../server/sim.ts#L267-L269)) und löst die Aussterben-Toast aus.
- Aussterben kann passieren durch
  - Tod durch Hunger / Idle-Verfall,
  - Altertod (`MAX_AGE_SEC`),
  - Tierangriff (Mammut, Höhlenlöwe, Bison),
  - Frauen-Transfer beim Treffen, der die letzte Einheit nimmt.

## Solidarität & Gruppen-Kampf (innerhalb eines Stamms)

`GROUP_FIGHT_RANGE = 7` Tiles ([`sim.ts:134`](../server/sim.ts#L134)).

- **Hilferuf bei Tier-Angriff** ([`callForHelp`](../server/sim.ts#L577-L591)):
  Wird eine Einheit von einem Tier angegriffen, übernehmen alle eigenen
  Stammesgeschwister im Umkreis von `GROUP_FIGHT_RANGE`, die nichts Wichtiges tun,
  das Tier als Ziel.
- **Mit-jagen, wenn Allies kämpfen** ([`maybeAutoEngage`](../server/sim.ts#L538-L575)):
  Eine idle Einheit, deren Stammesgeschwister in der Nähe ein Tier jagt, schließt sich
  automatisch der Jagd an.
- **Selber rallyen, wenn ein Tier in Sicht ist** ([`rallyAlliesToHunt`](../server/sim.ts#L593-L609)):
  Beginnt eine Einheit eine Jagd, ziehen unbeschäftigte Allies im Umkreis mit.
- Außerhalb des Stamms gilt **kein** Hilferuf — Spieler greifen Spieler nicht an,
  und Allianzen über Stammesgrenzen hinweg gibt es nicht.

## Stammeszusammenhalt — KI-Verhalten

Geregelt in [`server/aiBot.ts`](../server/aiBot.ts):

- **Regroup:** Einheit weiter als `REGROUP_RADIUS = 7` Tiles vom Stammeszentrum
  wird zurückbeordert ([`aiBot.ts:38`](../server/aiBot.ts#L38),
  [`aiBot.ts:118-128`](../server/aiBot.ts#L118-L128)).
- **Ressourcen-/Jagdsuche:** alle Einheiten suchen Ziele relativ zum
  **Stammeszentrum**, nicht zur eigenen Position
  ([`aiBot.ts:194-208`](../server/aiBot.ts#L194-L208)).
- **Distanzlimit:** Ziele weiter als `MAX_TARGET_DIST_FROM_CENTER = 10` Tiles
  vom Zentrum werden ignoriert ([`aiBot.ts:39`](../server/aiBot.ts#L39)).
- **Wandern:** Ankerpunkt ist Mittel aus driftendem Explore-Center und tatsächlichem
  Stammeszentrum ([`aiBot.ts:227-241`](../server/aiBot.ts#L227-L241)).
- Resultat: KI-Stämme bleiben dicht beisammen, ähnlich wie ein Spieler-Stamm,
  der mit Gruppenbefehl bewegt wird.

## Spielerverhalten — keine Stammessozial-Regeln auf Spieler

Spielerstämme werden **nicht** vom Bot gesteuert, ihre Einheiten reagieren aber auf
dieselben Sim-Regeln (Hilferuf, Mit-Jagen, Frauen-Transfer im Treffen,
Wachstums-/Alters-Regeln). Der Spieler entscheidet nur **was** der Stamm tut, nicht
**ob** Geburten/Tod/Transfers stattfinden — die ergeben sich automatisch aus den
oben genannten Regeln.
