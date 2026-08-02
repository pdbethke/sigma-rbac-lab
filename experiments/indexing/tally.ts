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

/** Ask Prisma itself for the DDL, so the index list is not inferred from source. */
export function extractDdl(projectDir: string): string {
  const schema = [
    join(projectDir, "prisma", "schema.prisma"),
    join(projectDir, "schema.prisma"),
  ].find(existsSync);
  if (!schema) return "";
  try {
    return execFileSync(
      "npx",
      ["prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", schema, "--script"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    return "";
  }
}

export interface TrialRow extends Grade {
  run: string;
  arm: number;
  trial: number;
  gradeable: boolean;
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
      total_indexes INTEGER, composite_count INTEGER,
      inventory_daily VARCHAR, adjustments VARCHAR
    )
  `);
  for (const row of rows) {
    await connection.run(
      "INSERT INTO trials VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [
        row.run, row.arm, row.trial, row.gradeable,
        row.totalIndexes, row.compositeCount, row.inventoryDaily, row.adjustments,
      ],
    );
  }
  connection.closeSync();
}

async function main(): Promise<void> {
  const runsDir = new URL("./runs/", import.meta.url).pathname;
  const header = ["| run | total | composite | inventory_daily | adjustments |",
    "| --- | --- | --- | --- | --- |"];
  const bodyRows: string[] = [];
  const trialRows: TrialRow[] = [];

  for (const run of readdirSync(runsDir).sort()) {
    const dir = join(runsDir, run);
    const { arm, trial } = parseRunName(run);
    const ddl = extractDdl(dir);
    writeFileSync(join(dir, "extracted.sql"), ddl);
    if (ddl === "") {
      bodyRows.push(`| ${run} | ungradeable | ungradeable | ungradeable | ungradeable |`);
      trialRows.push({
        run, arm, trial, gradeable: false,
        totalIndexes: 0, compositeCount: 0,
        inventoryDaily: "missing", adjustments: "missing",
      });
      continue;
    }
    const result = grade(parseIndexes(ddl));
    bodyRows.push(
      `| ${run} | ${result.totalIndexes} | ${result.compositeCount} | ` +
        `${result.inventoryDaily} | ${result.adjustments} |`,
    );
    trialRows.push({
      run, arm, trial, gradeable: true,
      totalIndexes: result.totalIndexes, compositeCount: result.compositeCount,
      inventoryDaily: result.inventoryDaily, adjustments: result.adjustments,
    });
  }

  console.log(header.concat(bodyRows).join("\n"));
  await recordMetrics(trialRows, new URL("./metrics.duckdb", import.meta.url).pathname);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
