// experiments/indexing/tallyCrossModel.ts — Task 14: grade runs-crossmodel/, preserving
// the pilot's 10 rows in metrics.duckdb rather than dropping the table.
//
// Reuses grade(), countIndexes(), extractDdl() and parseIndexes() UNCHANGED — per the
// task ruling, grade() and the three index counts are never modified in response to
// how any model scores. This file only adds model/model_version/cost_usd/batch
// columns and a second population pass; the grading logic itself is imported, not
// reimplemented.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { parseIndexes } from "./parseIndexes.ts";
import { grade, countIndexes, extractDdl } from "./tally.ts";

interface CrossModelRow {
  run: string;
  arm: number;
  trial: number;
  model: string;
  modelVersion: string;
  costUsd: number | null;
  gradeable: boolean;
  ungradeableReason: string | null;
  totalIndexes: number;
  explicitIndexes: number;
  inScopeIndexes: number;
  compositeCount: number;
  inventoryDaily: string;
  adjustments: string;
}

const MODEL_VERSION: Record<string, string> = {
  claude: "claude-opus-4-8",
  gemini: "gemini-3.6-flash",
  codex:
    "codex-cli 0.142.5 default under ChatGPT-account auth; underlying model self-reported as GPT-5, not independently verified",
};

function parseRunDir(model: string, run: string): { arm: number; trial: number } {
  const match = run.match(/^arm(\d+)-trial(\d+)$/);
  if (!match) throw new Error(`unrecognized run directory name: ${model}/${run}`);
  return { arm: Number(match[1]), trial: Number(match[2]) };
}

/** Claude trials write result.json (--output-format json); read total_cost_usd if present. */
function claudeCost(dir: string): number | null {
  const resultPath = join(dir, "result.json");
  if (!existsSync(resultPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(resultPath, "utf8"));
    return typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : null;
  } catch {
    return null;
  }
}

/** Best-effort reason for a trial with no extractable DDL. Reported, never guessed at length. */
function ungradeableReason(dir: string): string {
  const exitCodePath = join(dir, "exit_code.txt");
  const exitCode = existsSync(exitCodePath) ? readFileSync(exitCodePath, "utf8").trim() : null;
  if (exitCode === "124") return "timeout (exceeded harness's 600s cap)";
  if (exitCode && exitCode !== "0") return `CLI exited ${exitCode}`;
  const hasSchema =
    existsSync(join(dir, "prisma", "schema.prisma")) || existsSync(join(dir, "schema.prisma"));
  if (!hasSchema) return "no prisma/schema.prisma produced";
  return "prisma migrate diff could not read the produced schema";
}

async function main(): Promise<void> {
  const runsDir = new URL("./runs-crossmodel/", import.meta.url).pathname;
  const rows: CrossModelRow[] = [];
  const summaryLines: string[] = [
    "| model | run | total | explicit | in_scope | composite | inventory_daily | adjustments | cost_usd |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const model of ["claude", "gemini", "codex"]) {
    const modelDir = join(runsDir, model);
    if (!existsSync(modelDir)) continue;
    for (const run of readdirSync(modelDir).sort()) {
      const dir = join(modelDir, run);
      const { arm, trial } = parseRunDir(model, run);
      const ddl = extractDdl(dir);
      writeFileSync(join(dir, "extracted.sql"), ddl);
      const cost = model === "claude" ? claudeCost(dir) : null;

      if (ddl === "") {
        const reason = ungradeableReason(dir);
        summaryLines.push(
          `| ${model} | ${run} | ungradeable | ungradeable | ungradeable | ungradeable | ungradeable | ungradeable | ${cost ?? "NULL"} |`,
        );
        rows.push({
          run: `${model}/${run}`, arm, trial, model, modelVersion: MODEL_VERSION[model],
          costUsd: cost, gradeable: false, ungradeableReason: reason,
          totalIndexes: 0, explicitIndexes: 0, inScopeIndexes: 0, compositeCount: 0,
          inventoryDaily: "missing", adjustments: "missing",
        });
        console.error(`UNGRADEABLE ${model}/${run}: ${reason}`);
        continue;
      }

      const parsed = parseIndexes(ddl);
      const result = grade(parsed);
      const counts = countIndexes(parsed);
      summaryLines.push(
        `| ${model} | ${run} | ${counts.totalIndexes} | ${counts.explicitIndexes} | ` +
          `${counts.inScopeIndexes} | ${result.compositeCount} | ${result.inventoryDaily} | ` +
          `${result.adjustments} | ${cost ?? "NULL"} |`,
      );
      rows.push({
        run: `${model}/${run}`, arm, trial, model, modelVersion: MODEL_VERSION[model],
        costUsd: cost, gradeable: true, ungradeableReason: null,
        totalIndexes: counts.totalIndexes, explicitIndexes: counts.explicitIndexes,
        inScopeIndexes: counts.inScopeIndexes, compositeCount: result.compositeCount,
        inventoryDaily: result.inventoryDaily, adjustments: result.adjustments,
      });
    }
  }

  console.log(summaryLines.join("\n"));
  writeFileSync(new URL("./tally-crossmodel-output.md", import.meta.url).pathname, summaryLines.join("\n") + "\n");

  await recordCrossModelMetrics(rows, new URL("./metrics.duckdb", import.meta.url).pathname);
}

async function recordCrossModelMetrics(rows: CrossModelRow[], dbPath: string): Promise<void> {
  const instance = await DuckDBInstance.create(dbPath);
  const connection = await instance.connect();

  // Preserve the pilot's existing 10 rows — never DROP TABLE. Add columns via ALTER
  // TABLE if this is the first run against this schema; backfill the pilot rows so
  // every row in `trials` has a batch/model tag, including the 10 that predate this
  // task.
  const tableInfo = await connection.runAndReadAll("PRAGMA table_info('trials')");
  const existingColumns = new Set(tableInfo.getRowObjects().map((r) => String(r.name)));

  const columnsToAdd: [string, string][] = [
    ["model", "VARCHAR"],
    ["model_version", "VARCHAR"],
    ["cost_usd", "DOUBLE"],
    ["batch", "VARCHAR"],
    ["ungradeable_reason", "VARCHAR"],
  ];
  for (const [name, type] of columnsToAdd) {
    if (!existingColumns.has(name)) {
      await connection.run(`ALTER TABLE trials ADD COLUMN ${name} ${type}`);
    }
  }

  // Backfill the pilot's 10 rows (all originally Claude Opus 5, arm-grouped design) —
  // only rows that don't already have a batch tag, so this is safe to re-run.
  await connection.run(
    `UPDATE trials SET model = 'claude-opus-5[1m]', model_version = 'claude-opus-5[1m]', ` +
      `batch = 'pilot' WHERE batch IS NULL`,
  );

  // Remove any prior crossmodel rows (idempotent re-grade), then insert fresh ones.
  await connection.run("DELETE FROM trials WHERE batch = 'crossmodel'");
  for (const row of rows) {
    await connection.run(
      `INSERT INTO trials (
        run, arm, trial, gradeable, total_indexes, explicit_indexes, in_scope_indexes,
        composite_count, inventory_daily, adjustments, model, model_version, cost_usd,
        batch, ungradeable_reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        row.run, row.arm, row.trial, row.gradeable,
        row.totalIndexes, row.explicitIndexes, row.inScopeIndexes, row.compositeCount,
        row.inventoryDaily, row.adjustments, row.model, row.modelVersion, row.costUsd,
        "crossmodel", row.ungradeableReason,
      ],
    );
  }

  const pilotCount = await connection.runAndReadAll(
    "SELECT COUNT(*) AS n FROM trials WHERE batch = 'pilot'",
  );
  const pilotN = pilotCount.getRowObjects()[0]?.n;
  console.error(`pilot batch row count after backfill: ${pilotN}`);
  if (Number(pilotN) !== 10) {
    throw new Error(`expected 10 pilot rows preserved, found ${pilotN}`);
  }

  connection.closeSync();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
