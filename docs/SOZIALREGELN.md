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

Werte stammen aus [`server/balancing.ts`](../server/balancing.ts) und sind zur
Laufzeit über die Balancing-DB überschreibbar.

- **HP-Grenze:** 100. Volle HP zu Spielbeginn.
- **HP-Verlust:**
  - `0,4 HP` pro begangener Tile-Distanz (`unit.hpLossPerTile`).
  - `0,12 HP/s` im Idle (Stoffwechsel, `unit.hpLossPerSecIdle`).
  - Voller HP-Drain wenn `wasser ≤ 0` (Verdursten = `hpMax/Tageslänge` pro s).
- **Essen** alle `1,0 s` (`eat.intervalSec`), sofern Vorrat im Stamm vorhanden.
  Auto-Eat greift unter `eat.autoeatHpThreshold = 51 %` HP – in dieser Reihenfolge:

  | Priorität | Ressource | HP-Gewinn |
  |---|---|---|
  | 1 | Kräuter | 35 |
  | 2 | Fleisch | 15 |
  | 3 | Fisch | 12 |
  | 4 | Pilze | 2 |
  | 5 | Beeren | 3 |

  Wasser heilt **nicht**, stillt nur den Durst (`eat.waterPerUnitPerDay = 1`,
  saisonal moduliert: Sommer 1,6×, Winter 0,8×). Bei vollem Cap einer Nahrung
  wird sie auch von gesunden Einheiten verbraucht, damit der nächste Drop nicht
  geclampt wird.
- **Altern:** `ageSec` läuft mit der Zeit hoch. Kindheit bis
  `growth.childAgeSec = 240 s`, "alt" ab `growth.oldThresholdSec = 720 s`,
  Tod bei `growth.maxAgeSec = 960 s` (16 Min).
- **Tod:** HP ≤ 0 → Einheit wird im Tick-Reaper entfernt.

## Häuptling (`isChief`)

- Pro Stamm gibt es **genau einen** Häuptling
  ([`sim.ts:1427-1453`](../server/sim.ts#L1427-L1453)).
- **Auswahl:** ältester Mann; gibt es keinen Mann, die älteste Frau.
- Wird der Häuptling übertragen oder stirbt, wird in `updateChiefs` ein neuer bestimmt.
- Beim Frauen-Transfer im Treffen verliert die transferierte Einheit ihren Chief-Status
  ([`sim.ts:1299`](../server/sim.ts#L1299)).

## Innerstämmische Wachstum (Geburt)

In [`growthCheck`](../server/sim.ts):

- **Mehrere Schwangerschaften gleichzeitig:** Jede Frau im Stamm hat ihren
  **eigenen** Schwangerschafts-Timer. Mehrere Geburten pro Stamm parallel sind möglich.
- **Voraussetzungen pro Frau und Tick:**
  - Stamm hat ≥ 2 Mitglieder,
  - mindestens **1 reifer Mann** (`ageSec ≥ growth.childAgeSec`) im Stamm,
  - die Frau ist erwachsen (`ageSec ≥ growth.childAgeSec`),
  - die Frau ist gesund (`hp/hpMax ≥ growth.pregnancyHealthMinFrac = 0.30`).
- **Timer:** `pregnancyTimer[unitId]` läuft pro Frau hoch. Sobald
  `pregnancyTimer ≥ growth.requiredSec = 288 s` wird ein neues Mitglied **am
  Stammeszentrum** gespawnt und der Timer der Frau zurückgesetzt.
- **Reset:** Bedingungen verletzt (zu wenig Männer, zu krank, Frau ist Kind,
  Frau wechselt Stamm, Frau stirbt) → Timer der Frau wird gelöscht.
- **Vollst-Stamm = Spaltung statt Blockade:** Erreicht ein Stamm
  `MAX_TRIBE_SIZE = 12` und versucht eine Frau zu gebären, wird per
  `splitOffNewTribe` ein Tochterstamm abgespalten:
  - Voraussetzung: ein freier `PlayerId`-Slot existiert + ≥ 2 Founder + ≥ 1
    Restmitglied beim Mutterstamm.
  - Founder = jede zweite reife Frau / jeder zweite reife Mann (sortiert nach
    Alter, absteigend), bis ≥ 2 zusammen.
  - Founder behalten ihre Position, bekommen neue Farbe, leeres Inventar,
    eigenen Spawn am Stamm-Schwerpunkt, gleiche Sprache + Toast-Event.
  - Anschließend wird die geplante Geburt im Mutterstamm trotzdem ausgeführt.
  - Klappt die Spaltung nicht (kein Slot, zu wenige Founder), bleibt der
    Schwangerschafts-Timer bei `growth.requiredSec` stehen und wartet.
- **Geburts-Cap pro Tick:** maximal so viele Geburten wie Plätze unter
  `MAX_TRIBE_SIZE` frei sind; weitere fertige Schwangerschaften halten ihren
  Timer und gebären, sobald wieder Platz ist.
- **Geschlecht des Neugeborenen:** zufällig 50/50 (deterministisch aus Seed).
- **Name:** aus der Sprache des Stamms.
- **Start-Alter:** `0 s`. Das Neugeborene ist also Kind, bis
  `ageSec ≥ growth.childAgeSec = 240 s`.

Im Snapshot (`growthSnapshot`) wird pro Stamm die **am weitesten fortgeschrittene**
Schwangerschaft als Fortschritt gemeldet; `growthActive[p]` ist true, sobald
mindestens eine Frau im Stamm schwanger ist.

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
   Chief-Status, bekommt die Farbe des neuen Stamms, steht idle und ihr
   `pregnancyTimer` wird gelöscht (eine laufende Schwangerschaft endet beim
   Stammwechsel).
6. **Keine Bonus-Geburt:** Treffen lösen **keine** kostenlose Geburt mehr aus —
   Wachstum läuft ausschließlich über die per-Frau-Timer in `growthCheck`.
7. **Toast-Event** wird emittiert (Treffen + transferierte Anzahl).

### Konsequenzen für kleine Stämme

- **Letzte Einheit weiblich:** Trifft sie auf einen Stamm mit Männer-Überschuss, wird
  sie übergeben → eigener Stamm ist leer und stirbt aus.
- **Letzte Einheit männlich:** Es können nur Frauen *zu* dir wandern, nie weg.
  Ein Treffen kann den eigenen Stamm in dem Fall nur vergrößern.
- Volle Stämme (`|Stamm| = MAX_TRIBE_SIZE`) nehmen keine weiteren Frauen auf.

## Lagerfeuer

Logik in [`campfireStep`](../server/sim.ts), Werte in
[`balancing.ts`](../server/balancing.ts):

- `fire.igniteMinUnits = 2` — mindestens zwei Stammesmitglieder im Cluster.
- `fire.igniteClusterRadius = 2,5` Tiles — Clusterradius um den Schwerpunkt.
- `fire.range = 2,5` Tiles — Heil-/Schutzradius um das Feuer.
- `fire.igniteHolzCost = 5`, `fire.igniteSteinCost = 1` — Erstkosten.
- **Brenndauer pro Nachlege-Paar (1 Holz + 1 Stein)** wird zur Laufzeit
  saisonal berechnet (`Sim.campfireBurnPerFuelSec`):
  `aktuelleNachtlänge / day.nightCampfireHolzPerNight`. Bei Standard-Werten:
  Frühling/Herbst-Nacht 120 s ÷ 40 = 3 s; im Winter 192 s ÷ 40 ≈ 4,8 s; im
  Sommer 60 s ÷ 40 = 1,5 s. Pro durchgehend brennender Nacht: ~40 Holz und
  ~40 Stein, unabhängig von der Saison.
- `fire.hpRegenPerSec = 1,2` — Heilung pro Sekunde am Feuer.
- `fire.repelRadiusBonus = 2,5` — Räuber-Abwehr-Bonus zusätzlich zur Reichweite.

### Entzünden

- Pro Stamm gibt es **maximal ein** Lagerfeuer.
- Stehen ≥ `fire.igniteMinUnits = 2` Mitglieder eines Stamms ohne Bewegung,
  Harvest- oder Hunt-Ziel innerhalb des Clusterradius zusammen, läuft ein
  Ignite-Timer.
- Verlässt der Cluster die Position oder fällt unter zwei Mitglieder, wird der
  Timer zurückgesetzt.
- Erreicht der Timer das Anzünd-Delay und der Stamm hat ≥
  `fire.igniteHolzCost = 5` Holz + `fire.igniteSteinCost = 1` Stein im Vorrat,
  wird das Feuer am Cluster-Schwerpunkt entzündet.

### Brennen, Nachlegen, Erlöschen

- Pro Tick zählt der Brennstoff-Timer dt herunter.
- Läuft er ab, wird **nur dann** nachgelegt, wenn mindestens eine eigene Einheit
  innerhalb von `fire.range` steht **und** der Stamm noch 1 Holz + 1 Stein
  hat. Dann werden Holz und Stein verbraucht und der Timer auf
  `campfireBurnPerFuelSec()` (saisonal) wieder aufgefüllt.
- Andernfalls erlischt das Feuer.

### Wirkung am Feuer

Befindet sich eine Einheit innerhalb von `fire.range` zum eigenen Lagerfeuer:

- **Kein Idle-HP-Verfall** (`unit.hpLossPerSecIdle` greift nicht).
- **Heilung** mit `fire.hpRegenPerSec × 1,5` HP/s am Feuer, ohne Vorrat zu
  verbrauchen.
- **Räuber-Abwehr** bis `fire.range + fire.repelRadiusBonus`.

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
