// Standalone performance benchmark for the RTS simulation.
// Runs a fixed number of ticks with N AI tribes, no clients, and
// prints the average / p50 / p95 / max wall-clock time per tick.
// Usage: npx tsx scripts/perf-bench.ts [tribes=10] [seconds=60]

import { Sim } from "../server/sim";
import { AIBot } from "../server/aiBot";
import { MAX_PLAYERS, TICK_RATE } from "../shared/protocol";
import { NAME_LANGUAGES, NameLanguage, TRIBE_NAME_POOL_SIZE } from "../shared/names";

function pickBotTribes(
  count: number,
): Array<{ tribeNameIndex: number; language: NameLanguage }> {
  const indices = Array.from({ length: TRIBE_NAME_POOL_SIZE }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const picks: Array<{ tribeNameIndex: number; language: NameLanguage }> = [];
  for (let i = 0; i < count && i < indices.length; i++) {
    picks.push({
      tribeNameIndex: indices[i],
      language: NAME_LANGUAGES[i % NAME_LANGUAGES.length],
    });
  }
  return picks;
}

const tribes = Math.min(MAX_PLAYERS, Number(process.argv[2] ?? 10));
const seconds = Number(process.argv[3] ?? 60);
const totalTicks = Math.floor(seconds * TICK_RATE);
const dt = 1 / TICK_RATE;

const seed = Number(process.env.RTS_SEED ?? 1);
const world = new Sim(seed);
const bots: AIBot[] = [];

const picks = pickBotTribes(tribes);
for (let i = 0; i < tribes; i++) {
  const pick = picks[i] ?? picks[picks.length - 1];
  world.addPlayer(i, pick.language);
  world.followChiefEnabled[i] = true;
  bots.push(new AIBot(world, i));
}

const samples: number[] = new Array(totalTicks);
const sectionLen = Math.max(1, Math.floor(totalTicks / 6));
const slowestTicks: Array<{ tick: number; ms: number; counts: string }> = [];

console.log(
  `[bench] tribes=${tribes} seconds=${seconds} ticks=${totalTicks} tickRate=${TICK_RATE}Hz seed=${seed}`,
);

const t0 = performance.now();
for (let t = 0; t < totalTicks; t++) {
  const a = performance.now();
  for (const bot of bots) bot.update(dt);
  world.step(dt);
  // Drain per-tick consumables so they don't accumulate unbounded.
  world.consumeNewRemovedObjects();
  world.consumeRespawnedObjects();
  world.consumeNewFootprints();
  world.consumeNewUnits();
  world.consumeEncounterEvents();
  world.consumeRemovedAnimalIds();
  world.consumeArtifactFinds();
  world.consumeResourceFlows();
  world.consumeNewDropPiles();
  world.consumeRemovedDropPileIds();
  world.consumeTreeGrowthEvents();
  world.consumeDeadUnitIds();
  world.consumeExtinctTribes();
  world.consumeRespawnedTribes();
  world.consumeTribeSplits();
  world.consumeRemovedFishIds();
  world.consumeRemovedCampfireIds();
  samples[t] = performance.now() - a;
  if (samples[t] > 40) {
    slowestTicks.push({
      tick: t,
      ms: samples[t],
      counts: `U:${world.units.size} A:${world.animals.size} F:${world.fishes.size} tick%5=${t % 5} tick%10=${t % 10}`,
    });
  }

  if ((t + 1) % sectionLen === 0) {
    const slice = samples.slice(t + 1 - sectionLen, t + 1);
    summarize(`tick ${t + 1 - sectionLen + 1}..${t + 1}`, slice);
  }
}
const wall = performance.now() - t0;

console.log("--- summary ---");
summarize("all", samples);
console.log(
  `[bench] wall=${wall.toFixed(0)}ms units=${world.units.size} animals=${world.animals.size} fishes=${world.fishes.size}`,
);
if (slowestTicks.length > 0) {
  slowestTicks.sort((a, b) => b.ms - a.ms);
  console.log("--- slowest ticks (>40ms) ---");
  for (const s of slowestTicks.slice(0, 15)) {
    console.log(
      `[bench] tick=${String(s.tick).padStart(5)} ms=${s.ms.toFixed(2).padStart(7)} ${s.counts}`,
    );
  }
}

function summarize(label: string, arr: number[]): void {
  const sorted = [...arr].sort((a, b) => a - b);
  const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const max = sorted[sorted.length - 1];
  const budget = 1000 / TICK_RATE;
  const overBudget = arr.filter((v) => v > budget).length;
  console.log(
    `[bench] ${label.padEnd(20)} avg=${avg.toFixed(2)}ms p50=${p50.toFixed(2)} p95=${p95.toFixed(2)} p99=${p99.toFixed(2)} max=${max.toFixed(2)} overBudget=${overBudget}/${arr.length}`,
  );
}
