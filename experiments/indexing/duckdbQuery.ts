import { readFileSync } from "node:fs";
import { DuckDBInstance } from "@duckdb/node-api";

/** Run SQL against a DuckDB file and return the final statement's rows as text. */
export async function runSql(dbPath: string, sql: string): Promise<string> {
  const instance = await DuckDBInstance.create(dbPath);
  const connection = await instance.connect();
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let output = "";
  for (const statement of statements) {
    const reader = await connection.runAndReadAll(statement);
    const rows = reader.getRowObjects();
    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      output =
        [columns.join(" | "), columns.map(() => "---").join(" | ")]
          .concat(rows.map((row) => columns.map((c) => String(row[c])).join(" | ")))
          .join("\n") + "\n";
    }
  }
  connection.closeSync();
  return output;
}

async function main(): Promise<void> {
  const [dbPath, sqlOrFile] = process.argv.slice(2);
  if (!dbPath) throw new Error("usage: duckdbQuery.ts <db-path> [<sql> | -]");
  const sql =
    !sqlOrFile || sqlOrFile === "-"
      ? readFileSync(0, "utf8")
      : sqlOrFile.endsWith(".sql")
        ? readFileSync(sqlOrFile, "utf8")
        : sqlOrFile;
  process.stdout.write(await runSql(dbPath, sql));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
