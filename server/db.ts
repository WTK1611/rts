import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ScoreEntry } from "../shared/protocol";

const DB_PATH = resolve(process.env.RTS_DB_PATH ?? "./data/rts.db");
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    time_sec INTEGER NOT NULL,
    collected INTEGER NOT NULL,
    tribe INTEGER NOT NULL,
    score INTEGER NOT NULL,
    ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scores_score_desc ON scores(score DESC, ts ASC);
`);

const insertStmt = db.prepare(
  `INSERT INTO scores (name, time_sec, collected, tribe, score, ts)
   VALUES (?, ?, ?, ?, ?, ?)`,
);

const topStmt = db.prepare(
  `SELECT name, time_sec AS timeSec, collected, tribe, score, ts
     FROM scores
     ORDER BY score DESC, ts ASC
     LIMIT ?`,
);

const rankStmt = db.prepare(
  `SELECT 1 + COUNT(*) AS rank FROM scores
     WHERE score > ? OR (score = ? AND ts < ?)`,
);

const totalStmt = db.prepare(`SELECT COUNT(*) AS n FROM scores`);

export function addScore(entry: ScoreEntry): void {
  insertStmt.run(
    entry.name,
    entry.timeSec | 0,
    entry.collected | 0,
    entry.tribe | 0,
    entry.score | 0,
    entry.ts | 0,
  );
}

export function topScores(limit: number): ScoreEntry[] {
  const rows = topStmt.all(limit) as Array<{
    name: string;
    timeSec: number;
    collected: number;
    tribe: number;
    score: number;
    ts: number;
  }>;
  return rows.map((r) => ({ ...r }));
}

export function rankFor(score: number, ts: number): number {
  const row = rankStmt.get(score, score, ts) as { rank: number } | undefined;
  return row ? Number(row.rank) : 1;
}

export function totalScores(): number {
  const row = totalStmt.get() as { n: number } | undefined;
  return row ? Number(row.n) : 0;
}

console.log(`[rts-server] sqlite db at ${DB_PATH}, ${totalScores()} scores`);
