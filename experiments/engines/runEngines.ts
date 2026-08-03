/**
 * The engine comparison, end to end and reproducible offline.
 *
 *     node --experimental-strip-types experiments/engines/runEngines.ts
 *
 * Same rows, same query, two engines. SQLite is a row store and names the index
 * it uses. DuckDB is columnar and produces the same physical plan whether or not
 * the equivalent index exists. Both outputs are written next to this file and
 * committed, so a reader can diff their own run against ours.
 *
 * The rows come from generateFacts.ts — synthetic, deterministic, and shaped to
 * match the original fact table exactly (94,500 rows, 210 dates, 3 stores, 150
 * products each). A plan depends on cardinality and distribution, not on values.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";
import { COLUMNS, SHAPE, rows, toCsv } from "./generateFacts.ts";

const HERE = fileURLToPath(new URL("./", import.meta.url));
const CSV = `${HERE}inventory_daily.csv`;
const SQLITE_DB = `${HERE}engines.sqlite`;
const DUCK_DB = `${HERE}engines.duckdb`;

const QUERY_SQLITE = `
SELECT * FROM inventory_daily
WHERE store_id = (SELECT store_id FROM inventory_daily LIMIT 1)
  AND snapshot_date > '2026-01-01'`;

const QUERY_DUCK = `
SELECT store_id, SUM(inventory_value)
FROM inventory_daily
WHERE store_id = (SELECT store_id FROM inventory_daily LIMIT 1)
  AND snapshot_date > '2026-01-01'
GROUP BY store_id`;

function buildSqlite(): string {
  execFileSync("rm", ["-f", SQLITE_DB]);
  const db = new DatabaseSync(SQLITE_DB);
  db.exec(`
    CREATE TABLE inventory_daily (
      snapshot_date TEXT NOT NULL, store_id TEXT NOT NULL, product_id TEXT NOT NULL,
      cost_per_unit REAL, units_on_hand INTEGER, units_on_order INTEGER,
      units_in_transit INTEGER, units_received INTEGER, units_shrunk INTEGER,
      reorder_point INTEGER, max_stock_level INTEGER, days_of_supply REAL,
      inventory_value REAL, is_stockout INTEGER, is_low_stock INTEGER,
      lost_sales_units INTEGER, lost_sales_value REAL, lead_time_days INTEGER,
      merchant_id TEXT,
      PRIMARY KEY (snapshot_date, store_id, product_id)
    );
    CREATE INDEX idx_inventory_store ON inventory_daily (store_id, snapshot_date);
  `);
  const insert = db.prepare(
    `INSERT INTO inventory_daily VALUES (${COLUMNS.map(() => "?").join(",")})`,
  );
  db.exec("BEGIN");
  let n = 0;
  for (const r of rows()) {
    insert.run(...(r as (string | number)[]));
    n++;
  }
  db.exec("COMMIT");
  if (n !== SHAPE.rows) throw new Error(`loaded ${n} rows, expected ${SHAPE.rows}`);

  const count = db.prepare("SELECT COUNT(*) AS n FROM inventory_daily").get() as { n: number };
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${QUERY_SQLITE}`).all() as { detail: string }[];
  db.close();

  return [
    `-- SQLite ${process.versions.sqlite ?? "(node:sqlite)"}`,
    `-- rows: ${count.n}`,
    `-- query:${QUERY_SQLITE}`,
    "",
    ...plan.map((p) => p.detail),
    "",
  ].join("\n");
}

async function buildDuckdb(): Promise<{ before: string; after: string }> {
  execFileSync("rm", ["-f", DUCK_DB]);
  const connection = await (await DuckDBInstance.create(DUCK_DB)).connect();
  await connection.run(
    `CREATE OR REPLACE TABLE inventory_daily AS SELECT * FROM read_csv_auto('${CSV}')`,
  );
  const count = await connection.runAndReadAll("SELECT COUNT(*) FROM inventory_daily");
  const rowCount = String(count.getRows()[0][0]);
  if (rowCount !== String(SHAPE.rows)) {
    throw new Error(`DuckDB loaded ${rowCount} rows, expected ${SHAPE.rows}`);
  }

  const explain = async (): Promise<string> => {
    const r = await connection.runAndReadAll(`EXPLAIN ${QUERY_DUCK}`);
    return r.getRows().map((row) => row.map(String).join("\n")).join("\n");
  };

  const before = await explain();
  await connection.run(
    "CREATE INDEX idx_inventory_store ON inventory_daily (store_id, snapshot_date)",
  );
  const after = await explain();
  connection.closeSync();

  const header = (label: string) =>
    `-- DuckDB physical plan, ${label} CREATE INDEX idx_inventory_store (store_id, snapshot_date)\n-- rows: ${rowCount}\n-- query:${QUERY_DUCK}\n\n`;
  return { before: header("BEFORE") + before + "\n", after: header("AFTER") + after + "\n" };
}

async function main(): Promise<void> {
  if (!existsSync(CSV)) writeFileSync(CSV, toCsv());

  const sqlitePlan = buildSqlite();
  writeFileSync(`${HERE}sqlite-explain.txt`, sqlitePlan);

  const { before, after } = await buildDuckdb();
  writeFileSync(`${HERE}duckdb-explain-before.txt`, before);
  writeFileSync(`${HERE}duckdb-explain-after.txt`, after);

  const namesIndex = /USING INDEX idx_inventory_store/.test(sqlitePlan);
  const duckUnchanged = before.split("\n").slice(4).join("\n") === after.split("\n").slice(4).join("\n");

  console.log(`SQLite plan names idx_inventory_store : ${namesIndex}`);
  console.log(`DuckDB plan identical before/after    : ${duckUnchanged}`);
  console.log("");
  console.log(sqlitePlan.split("\n").filter((l) => !l.startsWith("--")).join("\n").trim());

  if (!namesIndex || !duckUnchanged) {
    console.log("\nAT LEAST ONE CLAIM DID NOT REPRODUCE. The article must be changed, not this script.");
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
