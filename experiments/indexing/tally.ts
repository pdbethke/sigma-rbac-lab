import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { parseIndexes, type ParsedIndex } from "./parseIndexes.ts";

export type Verdict = "match" | "wrong-order" | "partial" | "missing";

export interface Grade {
  inventoryDaily: Verdict;
  adjustments: Verdict;
  totalIndexes: number;
  compositeCount: number;
}

/** Casing and separators vary by generator; compare on letters alone. */
function normalize(name: string): string {
  return name.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function gradeOne(
  indexes: ParsedIndex[],
  tableAliases: string[],
  target: string[],
): Verdict {
  const wanted = new Set(tableAliases.map(normalize));
  const onTable = indexes
    .filter((index) => wanted.has(normalize(index.table)))
    .map((index) => index.columns.map(normalize));
  if (onTable.length === 0) return "missing";

  const targetNormalized = target.map(normalize);
  const asKey = (columns: string[]) => columns.join(",");
  const keys = new Set(onTable.map(asKey));

  if (keys.has(asKey(targetNormalized))) return "match";
  if (keys.has(asKey([...targetNormalized].reverse()))) return "wrong-order";
  if (onTable.some((columns) => columns.some((c) => targetNormalized.includes(c)))) {
    return "partial";
  }
  return "missing";
}

export function grade(indexes: ParsedIndex[]): Grade {
  return {
    inventoryDaily: gradeOne(
      indexes,
      ["inventory_daily", "InventoryDaily"],
      ["store_id", "snapshot_date"],
    ),
    adjustments: gradeOne(
      indexes,
      ["inventory_adjustments", "InventoryAdjustment"],
      ["store_id", "product_id"],
    ),
    totalIndexes: indexes.length,
    compositeCount: indexes.filter((index) => index.columns.length > 1).length,
  };
}

/**
 * `total_indexes` (unchanged from `grade()`, kept for comparison) counts every parsed
 * index, including `CREATE UNIQUE INDEX` — which Prisma emits mechanically from any
 * `@unique` / `@@unique`, not from a session's access-pattern reasoning — and indexes
 * on tables entirely outside the oracle's graded pair. `explicit_indexes` and
 * `in_scope_indexes` narrow that down. This does not change `grade()` or its Verdict
 * columns; it is reported alongside them, not instead of them.
 */
export interface IndexCounts {
  totalIndexes: number;
  /** Non-unique indexes only — excludes anything Prisma derived from `@unique`. */
  explicitIndexes: number;
  /** Non-unique indexes, further restricted to InventoryDaily and
   *  InventoryAdjustment — the two tables the oracle and the grading target. */
  inScopeIndexes: number;
}

const IN_SCOPE_TABLES = new Set(
  ["inventory_daily", "InventoryDaily", "inventory_adjustments", "InventoryAdjustment"].map(
    normalize,
  ),
);

export function countIndexes(indexes: ParsedIndex[]): IndexCounts {
  const explicit = indexes.filter((index) => !index.unique);
  const inScope = explicit.filter((index) => IN_SCOPE_TABLES.has(normalize(index.table)));
  return {
    totalIndexes: indexes.length,
    explicitIndexes: explicit.length,
    inScopeIndexes: inScope.length,
  };
}

/**
 * Ask Prisma itself for the DDL, so the index list is not inferred from source.
 *
 * Two deviations from the brief's sketch, both confirmed against the trial data:
 *
 * 1. The brief's `execFileSync` call had no `cwd`, so `npx prisma` resolved this repo's
 *    own root-level Prisma 6.19.3 dev dependency and its `--to-schema-datamodel` schema
 *    path was interpreted relative to the repo root, not the trial directory — every
 *    trial came back ungradeable. Each trial installed its own `prisma` locally (some
 *    picked up Prisma 7 as the latest release; see below), and several trials moved
 *    their datasource config into a `prisma.config.ts` that Prisma only discovers via
 *    the current working directory. Fix: run with `cwd: projectDir` and a schema path
 *    relative to that `cwd`.
 * 2. 8 of the 10 trial projects resolved `prisma` to 7.9.1 (latest at run time), which
 *    renamed `--to-schema-datamodel` to `--to-schema` (the old flag now errors: "was
 *    removed. Please use --[from/to]-schema instead"). The other 2 trials pinned Prisma
 *    6.19.3 (matching the control run) and only accept the old flag name. Both flags
 *    are tried in turn so a trial's own Prisma version does not itself decide
 *    gradeability.
 */
export function extractDdl(projectDir: string): string {
  const schemaAbs = [
    join(projectDir, "prisma", "schema.prisma"),
    join(projectDir, "schema.prisma"),
  ].find(existsSync);
  if (!schemaAbs) return "";
  const schemaRelative = schemaAbs.slice(projectDir.length + 1);
  const flagsToTry = ["--to-schema", "--to-schema-datamodel"];
  for (const flag of flagsToTry) {
    try {
      return execFileSync(
        "npx",
        ["prisma", "migrate", "diff", "--from-empty", flag, schemaRelative, "--script"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], cwd: projectDir },
      );
    } catch {
      // try the next flag name
    }
  }
  return "";
}

export interface TrialRow extends Grade {
  run: string;
  arm: number;
  trial: number;
  gradeable: boolean;
  explicitIndexes: number;
  inScopeIndexes: number;
}

/** Parse `arm2-trial4` into { arm: 2, trial: 4 }. */
function parseRunName(run: string): { arm: number; trial: number } {
  const match = run.match(/^arm(\d+)-trial(\d+)$/);
  if (!match) throw new Error(`unrecognized run directory name: ${run}`);
  return { arm: Number(match[1]), trial: Number(match[2]) };
}

export async function recordMetrics(rows: TrialRow[], dbPath: string): Promise<void> {
  const instance = await DuckDBInstance.create(dbPath);
  const connection = await instance.connect();
  await connection.run("DROP TABLE IF EXISTS trials");
  await connection.run(`
    CREATE TABLE trials (
      run VARCHAR, arm INTEGER, trial INTEGER, gradeable BOOLEAN,
      total_indexes INTEGER, explicit_indexes INTEGER, in_scope_indexes INTEGER,
      composite_count INTEGER,
      inventory_daily VARCHAR, adjustments VARCHAR
    )
  `);
  for (const row of rows) {
    await connection.run(
      "INSERT INTO trials VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
      [
        row.run, row.arm, row.trial, row.gradeable,
        row.totalIndexes, row.explicitIndexes, row.inScopeIndexes,
        row.compositeCount, row.inventoryDaily, row.adjustments,
      ],
    );
  }
  connection.closeSync();
}

async function main(): Promise<void> {
  const runsDir = new URL("./runs/", import.meta.url).pathname;
  const header = [
    "| run | total | explicit | in_scope | composite | inventory_daily | adjustments |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  const bodyRows: string[] = [];
  const trialRows: TrialRow[] = [];

  for (const run of readdirSync(runsDir).sort()) {
    const dir = join(runsDir, run);
    const { arm, trial } = parseRunName(run);
    const ddl = extractDdl(dir);
    writeFileSync(join(dir, "extracted.sql"), ddl);
    if (ddl === "") {
      bodyRows.push(
        `| ${run} | ungradeable | ungradeable | ungradeable | ungradeable | ungradeable | ungradeable |`,
      );
      trialRows.push({
        run, arm, trial, gradeable: false,
        totalIndexes: 0, explicitIndexes: 0, inScopeIndexes: 0, compositeCount: 0,
        inventoryDaily: "missing", adjustments: "missing",
      });
      continue;
    }
    const parsed = parseIndexes(ddl);
    const result = grade(parsed);
    const counts = countIndexes(parsed);
    bodyRows.push(
      `| ${run} | ${counts.totalIndexes} | ${counts.explicitIndexes} | ` +
        `${counts.inScopeIndexes} | ${result.compositeCount} | ` +
        `${result.inventoryDaily} | ${result.adjustments} |`,
    );
    trialRows.push({
      run, arm, trial, gradeable: true,
      totalIndexes: counts.totalIndexes, explicitIndexes: counts.explicitIndexes,
      inScopeIndexes: counts.inScopeIndexes, compositeCount: result.compositeCount,
      inventoryDaily: result.inventoryDaily, adjustments: result.adjustments,
    });
  }

  console.log(header.concat(bodyRows).join("\n"));
  await recordMetrics(trialRows, new URL("./metrics.duckdb", import.meta.url).pathname);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
