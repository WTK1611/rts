// Lightweight client that joins a running server, listens for state
// messages, and reports the live serverTickMs average and unit/animal
// counts over a fixed window. Used to verify perf in a real WebSocket
// loop (different from perf-bench.ts which runs the sim in-process).
//
// Usage: npx tsx scripts/perf-client-probe.ts [ws://localhost:8788] [seconds=60]

import WebSocket from "ws";

const url = process.argv[2] ?? "ws://localhost:8788";
const seconds = Number(process.argv[3] ?? 60);

const ws = new WebSocket(url);
const samples: number[] = [];
let last = { units: 0, animals: 0, fishes: 0 };
let joined = false;
const startedAt = Date.now();

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "join", name: "perf-probe", language: "de" }));
});

ws.on("message", (raw) => {
  let msg: any;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    return;
  }
  if (msg.type === "init") {
    joined = true;
    return;
  }
  if (msg.type === "state") {
    if (typeof msg.serverTickMs === "number") samples.push(msg.serverTickMs);
    if (typeof msg.unitCount === "number") last.units = msg.unitCount;
    if (typeof msg.animalCount === "number") last.animals = msg.animalCount;
    if (typeof msg.fishCount === "number") last.fishes = msg.fishCount;
  }
});

ws.on("error", (e) => {
  console.error("[probe] ws error:", e.message);
  process.exit(1);
});

setTimeout(() => {
  if (!joined) {
    console.error("[probe] never received 'joined' — server may be unreachable");
    process.exit(2);
  }
  ws.close();
  if (samples.length === 0) {
    console.error("[probe] no state messages received");
    process.exit(3);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  const avg = sum / samples.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const max = sorted[sorted.length - 1];
  const budget = 50;
  const overBudget = samples.filter((s) => s > budget).length;
  const yellow = samples.filter((s) => s > budget * 1).length;
  const wallSec = (Date.now() - startedAt) / 1000;
  console.log(
    `[probe] url=${url} wall=${wallSec.toFixed(1)}s samples=${samples.length} world={U:${last.units} A:${last.animals} F:${last.fishes}}`,
  );
  console.log(
    `[probe] serverTickMs avg=${avg.toFixed(2)} p50=${p50.toFixed(2)} p95=${p95.toFixed(2)} p99=${p99.toFixed(2)} max=${max.toFixed(2)} overBudget=${overBudget}/${samples.length} budget=${budget}ms`,
  );
  const verdict = overBudget === 0
    ? "GREEN — no over-budget samples"
    : overBudget < samples.length * 0.02
      ? "GREEN — under 2% of samples flicker over budget"
      : overBudget < samples.length * 0.1
        ? "YELLOW — some over-budget spikes"
        : "RED — frequent over-budget ticks";
  console.log(`[probe] verdict: ${verdict}`);
  process.exit(0);
}, seconds * 1000);
