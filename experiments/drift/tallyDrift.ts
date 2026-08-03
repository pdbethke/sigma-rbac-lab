/**
 * Walk every drift cell, grade each increment from its committed indexes.txt,
 * print the tally, and persist one row per session to metrics.duckdb.
 *
 * Run: node --experimental-strip-types experiments/drift/tallyDrift.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  EXPECTED_BY_INCREMENT,
  gradeIncrement,
  newIndexes,
  parsePrismaIndexes,
  type Outcome,
  type PrismaIndex,
} from "./gradeDrift.ts";

const ROOT = new URL("../../", import.meta.url).pathname;
const DB_PATH = join(ROOT, "experiments/indexing/metrics.duckdb");

interface Cell {
  cell: string;
  task: number;
  dir: string;
  baseline: "indexed" | "stripped";
  note: string;
}

const CELLS: Cell[] = [
  { cell: "expansion", task: 15, dir: "experiments/drift/results", baseline: "indexed", note: "well-indexed baseline" },
  { cell: "stripped", task: 16, dir: "experiments/drift-stripped/results", baseline: "stripped", note: "same harness, @@index lines removed" },
  // Indexed, not stripped: its increment0 carries the same 10 declarations as the
  // Task 15 cell, and its outcomes track Task 15's rather than Task 16's. Task 17
  // re-ran the WELL-INDEXED condition outside the repo to test for skill
  // contamination — it was not a re-run of the stripped cell.
  { cell: "isolated", task: 17, dir: "experiments/drift-isolated/results", baseline: "indexed", note: "contamination check on the indexed condition, run outside the repo" },
  { cell: "tiers", task: 18, dir: "experiments/drift-tiers/results", baseline: "stripped", note: "cross-tier, arm B only" },
  { cell: "instruction", task: 19, dir: "experiments/drift-instruction/results-clean", baseline: "stripped", note: "stripped baseline plus one CLAUDE.md rule" },
];

export interface SessionRow {
  cell: string;
  task: number;
  model: string;
  arm: string;
  trial: number;
  increment: number;
  outcome: Outcome;
  added: number;
}

function readSnapshot(path: string): PrismaIndex[] {
  return existsSync(path) ? parsePrismaIndexes(readFileSync(path, "utf8")) : [];
}

/** "claude-trial2" -> {model:"claude", arm:"-", trial:2}; "armB-trial1" -> {model:"claude-opus-4-8", arm:"B", trial:1} */
function parseTrialDir(name: string): { model: string; arm: string; trial: number } | null {
  const armMatch = name.match(/^arm([AB])-trial(\d+)$/);
  if (armMatch) return { model: "claude", arm: armMatch[1], trial: Number(armMatch[2]) };
  const modelMatch = name.match(/^([a-z0-9.-]+)-trial(\d+)$/);
  if (modelMatch) return { model: modelMatch[1], arm: "B", trial: Number(modelMatch[2]) };
  return null;
}

/** Anomalies found while grading — printed, never silently absorbed. */
export const anomalies: string[] = [];

/**
 * The `before` state for an increment.
 *
 * For increments 2-4 it is the previous increment's snapshot, which is written
 * immediately after that session and is reliable.
 *
 * For increment 1 it is the cell's DECLARED baseline, not `increment0`. The
 * Task 18 runner guards its increment-0 capture with `[ ! -f "$resdir/increment0" ]`
 * while creating `increment0` as a directory, so the test is false forever and
 * every re-run of the script re-captured increment0 from the then-current
 * directory. In the codex trials — the ones that were re-run — increment0
 * therefore holds the FINISHED schema rather than the starting one, which would
 * make a session that added the right index score as having added nothing.
 *
 * A stripped cell's baseline is empty by construction, so we use that and flag
 * any increment0 that disagrees. Indexed cells keep increment0: theirs is
 * consistent at 10 declarations across every trial and predates that harness.
 */
function baselineFor(cell: Cell, trialDir: string, base: string): PrismaIndex[] {
  const inc0 = readSnapshot(join(base, trialDir, "increment0", "indexes.txt"));
  if (cell.baseline !== "stripped") return inc0;
  const stale = inc0.filter((i) => i.kind === "index");
  if (stale.length > 0) {
    anomalies.push(
      `${cell.cell}/${trialDir}: increment0 holds ${stale.length} @@index on a stripped ` +
        `baseline — ignored, empty baseline used instead (harness re-run artifact)`,
    );
  }
  return [];
}

export function gradeCell(cell: Cell): SessionRow[] {
  const base = join(ROOT, cell.dir);
  if (!existsSync(base)) return [];
  const rows: SessionRow[] = [];
  for (const trialDir of readdirSync(base).sort()) {
    const parsed = parseTrialDir(trialDir);
    if (!parsed) continue;
    for (const expectation of EXPECTED_BY_INCREMENT) {
      const n = expectation.increment;
      const here = join(base, trialDir, `increment${n}`, "indexes.txt");
      if (!existsSync(here)) continue;
      const before =
        n === 1
          ? baselineFor(cell, trialDir, base)
          : readSnapshot(join(base, trialDir, `increment${n - 1}`, "indexes.txt"));
      const after = readSnapshot(here);
      const added = newIndexes(before, after);
      rows.push({
        cell: cell.cell,
        task: cell.task,
        model: parsed.model,
        arm: parsed.arm,
        trial: parsed.trial,
        increment: n,
        outcome: gradeIncrement(added, expectation),
        added: added.length,
      });
    }
  }
  return rows;
}

async function persist(rows: SessionRow[]): Promise<void> {
  const instance = await DuckDBInstance.create(DB_PATH);
  const connection = await instance.connect();
  await connection.run("DROP TABLE IF EXISTS drift");
  await connection.run(`
    CREATE TABLE drift (
      cell VARCHAR, task INTEGER, model VARCHAR, arm VARCHAR,
      trial INTEGER, increment INTEGER, outcome VARCHAR, added INTEGER
    )
  `);
  for (const r of rows) {
    await connection.run("INSERT INTO drift VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
      r.cell, r.task, r.model, r.arm, r.trial, r.increment, r.outcome, r.added,
    ]);
  }
  connection.closeSync();
}

async function main(): Promise<void> {
  const all = CELLS.flatMap(gradeCell);

  const groups = new Map<string, SessionRow[]>();
  for (const r of all) {
    const k = r.cell === "tiers" ? `tiers/${r.model}` : r.cell;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  console.log("| cell | n | correct | partial | none |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const [name, rows] of groups) {
    const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
    console.log(
      `| ${name} | ${rows.length} | ${count("correct")} | ${count("partial")} | ${count("none")} |`,
    );
  }

  if (anomalies.length > 0) {
    console.log(`\nANOMALIES (${anomalies.length}) — reported, not absorbed:`);
    for (const a of anomalies) console.log(`  ${a}`);
  }

  await persist(all);
  console.log(`\n${all.length} sessions written to metrics.duckdb (table: drift)`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
