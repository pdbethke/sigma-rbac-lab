# Indexing Article Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a standalone article at `docs/posts/indexing.txt` arguing that indexing is a fundamental agentic development lets you blow past, written from evidence gathered first: a measured index-count test and a working N+1 scanner.

**Architecture:** Four phases, each feeding the next. A control run establishes what Prisma emits on its own, so the measurement is not confounded. A harness then runs fresh headless `claude -p` sessions that build a Prisma + TypeScript application over the lab's inventory domain; the indexes those sessions declare are extracted as real DDL via `prisma migrate diff` and graded against the hand-authored indexes in `oracle/schema.sql`. One generated application is promoted to `app/` uncorrected and becomes the corpus for an AST-based N+1 scanner, which ships as a skill wired to a `SessionStart` hook. The article is written last, from what those measurements produced.

**Tech Stack:** Node 22.23, TypeScript, Prisma with the SQLite provider, `@typescript-eslint/typescript-estree` for parsing, DuckDB for trial metrics and as the columnar counterpart in the engine comparison, vitest as the only test runner, the `claude` CLI 2.1.220 in `--print` mode. `oracle/` stays Python and is not touched.

## Global Constraints

- Article body is `.txt`, never Markdown. Unindented, one line per paragraph, no hard wraps. Blank line between any two short lines that must stay separate.
- US spelling throughout. No `organisation`, `behaviour`, `modelling`, `analyse`, `optimise`.
- No unrun claims. If a measurement was not taken, the article does not describe its result. No present-tense description of something that has not been executed.
- Sample size stated in the text as an explicit number ("n of 5"), never "agents tend to".
- Hook names and matchers are verified by firing them and observing output, never recalled. Claude Code has **no `PostCompact` hook**; the post-compaction hook is `SessionStart` with matcher `compact`.
- `31,500` is `My Inventory` for a store manager, per `expected/` and `VERIFY.md`. It is **not** the agent's corpus; that number is 150 / 450.
- Persona roles come from `data/roles.csv` verbatim. Priya is **Regional Manager**, not "regional director".
- Claims about Snowflake or Sigma storage are phrased as what that engine does, checked against current published documentation, never as a general claim about columnar databases.
- **DuckDB supports `CREATE INDEX`.** The article never says it has no indexes. The permitted claim is the narrow, measured one about what the plan does for an analytical scan, backed by committed `EXPLAIN` output.
- Every figure in the article comes out of a query against `experiments/indexing/metrics.duckdb` or a committed output file. No number is transcribed by hand.
- Raw transcripts, prompts, and trial counts are committed so every number in the piece is checkable.
- All new code is TypeScript under one root `package.json`. The repo does not acquire a second test stack.
- **Two artifacts, two jobs, and the split is deliberate:** Prisma is the corpus the scanner reads (the ORM story — N+1, `include`); raw SQL against SQLite is the instrument that measures indexes (the engine story). Do not merge them.

---

### Task 1: Node project and the index parser

The same parser reads both sides of the comparison — the hand-authored `oracle/schema.sql` and the DDL a generated app produces — so neither side gets a more generous reading than the other.

**Files:**
- Create: `package.json`
- Create: `vitest.config.ts`
- Create: `experiments/indexing/parseIndexes.ts`
- Create: `experiments/indexing/parseIndexes.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseIndexes(sql: string): ParsedIndex[]` where `ParsedIndex` is `{ table: string; columns: string[] }`, table and columns lowercased and unquoted, in file order. Used by Tasks 2 and 4.

- [ ] **Step 1: Create the Node project**

```json
{
  "name": "sigma-rbac-lab",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "scan": "node --experimental-strip-types .claude/skills/performance/scanNPlusOne.ts app"
  },
  "devDependencies": {
    "@duckdb/node-api": "^1.1.0",
    "@typescript-eslint/typescript-estree": "^8.0.0",
    "prisma": "^6.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["node_modules/**", "experiments/indexing/runs/**", "app/**"],
  },
});
```

The exclude matters: generated trial code lands under `runs/` and must never be collected as this repo's tests.

- [ ] **Step 2: Install and ignore**

```bash
npm install
printf 'node_modules/\n__pycache__/\nexperiments/indexing/engines.duckdb\nexperiments/indexing/runs/*/node_modules/\n' >> .gitignore
```

`metrics.duckdb` is **not** ignored — it holds the graded trial results and is the evidence behind every figure in the article. `engines.duckdb` is ignored: it is a 94,501-row load rebuilt in one command by Task 9, and only its `EXPLAIN` output is committed.

- [ ] **Step 3: Write the failing test**

```typescript
// experiments/indexing/parseIndexes.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIndexes } from "./parseIndexes.ts";

const ORACLE_INDEXES = [
  { table: "assignments", columns: ["user_id", "status"] },
  { table: "permissions", columns: ["role_id"] },
  { table: "inventory_daily", columns: ["store_id", "snapshot_date"] },
  { table: "inventory_adjustments", columns: ["store_id", "product_id"] },
];

describe("parseIndexes", () => {
  it("parses the oracle schema exactly", () => {
    const sql = readFileSync(new URL("../../oracle/schema.sql", import.meta.url), "utf8");
    expect(parseIndexes(sql)).toEqual(ORACLE_INDEXES);
  });

  it("parses the shape Prisma emits, with no space before the paren", () => {
    const sql =
      'CREATE INDEX "InventoryDaily_storeId_snapshotDate_idx" ON "InventoryDaily"("storeId", "snapshotDate");';
    expect(parseIndexes(sql)).toEqual([
      { table: "inventorydaily", columns: ["storeid", "snapshotdate"] },
    ]);
  });

  it("handles UNIQUE, IF NOT EXISTS, and identifiers containing spaces", () => {
    const sql = 'CREATE UNIQUE INDEX IF NOT EXISTS "idx_a" ON "Orders" ("Customer Id", placed_at);';
    expect(parseIndexes(sql)).toEqual([
      { table: "orders", columns: ["customer id", "placed_at"] },
    ]);
  });

  it("drops sort and collation suffixes from column names", () => {
    const sql = "CREATE INDEX idx_b ON t (a DESC, b COLLATE NOCASE);";
    expect(parseIndexes(sql)).toEqual([{ table: "t", columns: ["a", "b"] }]);
  });

  it("ignores commented-out indexes and CREATE TABLE", () => {
    const sql = [
      "-- CREATE INDEX idx_commented ON t (a);",
      "CREATE TABLE t (id TEXT PRIMARY KEY);",
      "CREATE INDEX idx_real ON t (a, b);",
    ].join("\n");
    expect(parseIndexes(sql)).toEqual([{ table: "t", columns: ["a", "b"] }]);
  });

  it("returns an empty array when there are no indexes", () => {
    expect(parseIndexes("CREATE TABLE t (id TEXT PRIMARY KEY);")).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./parseIndexes.ts`.

- [ ] **Step 5: Write the implementation**

```typescript
// experiments/indexing/parseIndexes.ts
export interface ParsedIndex {
  table: string;
  columns: string[];
}

const COMMENT = /--[^\n]*/g;
const CREATE_INDEX =
  /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["`[]?[\w]+["`\]]?\s+ON\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)\s*\(([^)]*)\)/gi;

/** Strip one layer of quoting, or take the first bare token, then lowercase. */
function clean(raw: string): string {
  const trimmed = raw.trim();
  const quoted = trimmed.match(/^["`[](.*?)["`\]]/);
  if (quoted) return quoted[1].toLowerCase();
  return (trimmed.split(/\s+/)[0] ?? "").toLowerCase();
}

/** Every CREATE INDEX in the DDL, in file order. */
export function parseIndexes(sql: string): ParsedIndex[] {
  const stripped = sql.replace(COMMENT, "");
  const found: ParsedIndex[] = [];
  for (const match of stripped.matchAll(CREATE_INDEX)) {
    const columns = match[2]
      .split(",")
      .map(clean)
      .filter((column) => column.length > 0);
    found.push({ table: clean(match[1]), columns });
  }
  return found;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: 6 passed. If `parses the oracle schema exactly` fails, do **not** edit the expected array to match — read `oracle/schema.sql:96-226` and fix the parser. Those four indexes are ground truth for the whole plan.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .gitignore experiments/indexing/
git commit -m "Add the Node project and an index parser graded against the oracle's four"
```

---

### Task 2: The control run — what does Prisma emit on its own?

Prisma's behavior on relation fields is the confound. If it emitted indexes for relation scalars unprompted, every trial would be credited with work the agent did not do. This has to be measured before any trial runs, and the answer goes in the article either way.

**Files:**
- Create: `experiments/indexing/control/schema.prisma`
- Create: `experiments/indexing/control/control.sql` (generated)
- Create: `experiments/indexing/control/CONTROL.md`

**Interfaces:**
- Consumes: `parseIndexes` from Task 1.
- Produces: `experiments/indexing/control/control.sql`, and a recorded count that Task 4's grading and the article both cite.

- [ ] **Step 1: Hand-write a schema with zero index declarations**

Model only the inventory half of `oracle/schema.sql`. Relations are declared; no `@@index`, no `@unique` beyond primary keys.

```prisma
// experiments/indexing/control/schema.prisma
datasource db {
  provider = "sqlite"
  url      = "file:./control.db"
}

model Store {
  storeId   String  @id
  storeKey  String
  storeName String
  inventory InventoryDaily[]
  adjustments InventoryAdjustment[]
}

model ProductType {
  productTypeId String @id
  name          String
  families      ProductFamily[]
}

model ProductFamily {
  productFamilyId String      @id
  name            String
  productTypeId   String
  productType     ProductType @relation(fields: [productTypeId], references: [productTypeId])
  lines           ProductLine[]
}

model ProductLine {
  productLineId   String        @id
  name            String
  productFamilyId String
  productFamily   ProductFamily @relation(fields: [productFamilyId], references: [productFamilyId])
  products        Product[]
}

model Brand {
  brandId   String    @id
  brandName String
  products  Product[]
}

model Product {
  productId     String      @id
  skuNumber     String
  productName   String
  productLineId String
  brandId       String
  productLine   ProductLine @relation(fields: [productLineId], references: [productLineId])
  brand         Brand       @relation(fields: [brandId], references: [brandId])
  inventory     InventoryDaily[]
  adjustments   InventoryAdjustment[]
}

model InventoryDaily {
  snapshotDate DateTime
  storeId      String
  productId    String
  unitsOnHand  Int
  isLowStock   Boolean
  store        Store    @relation(fields: [storeId], references: [storeId])
  product      Product  @relation(fields: [productId], references: [productId])

  @@id([snapshotDate, storeId, productId])
}

model InventoryAdjustment {
  adjustmentId String   @id
  storeId      String
  productId    String
  adjustedAt   DateTime
  unitsDelta   Int
  reason       String
  store        Store    @relation(fields: [storeId], references: [storeId])
  product      Product  @relation(fields: [productId], references: [productId])
}
```

- [ ] **Step 2: Emit the DDL**

```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel experiments/indexing/control/schema.prisma \
  --script > experiments/indexing/control/control.sql
```

If this fails because Prisma cannot fetch its engines, run `npm install` again with network access. Do not work around it by hand-writing the DDL — the point of this step is that Prisma produced it.

- [ ] **Step 3: Count what came out**

```bash
grep -c 'CREATE INDEX' experiments/indexing/control/control.sql || echo 0
grep -n 'CREATE INDEX' experiments/indexing/control/control.sql
```

- [ ] **Step 4: Record the finding**

Write `CONTROL.md` stating: the Prisma version (`npx prisma --version`), the exact command, the number of `CREATE INDEX` statements emitted from a schema with zero `@@index` declarations, and the list of them if non-zero.

Then state the consequence explicitly, because Task 4's grading depends on it:

- **If zero:** every index in a trial is attributable to the session. Grading is unmodified.
- **If non-zero:** those indexes are subtracted before grading, and the article says so in the text rather than quietly reporting inflated numbers.

- [ ] **Step 5: Commit**

```bash
git add experiments/indexing/control/
git commit -m "Control run: what Prisma emits from a schema declaring no indexes"
```

---

### Task 3: The trial prompts and harness

**Files:**
- Create: `experiments/indexing/prompt-arm1.txt`
- Create: `experiments/indexing/prompt-arm2.txt`
- Create: `experiments/indexing/runTrials.sh`
- Create: `experiments/indexing/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `experiments/indexing/runs/arm<N>-trial<M>/`, each containing a generated project and `transcript.txt`. Task 4 reads these.

- [ ] **Step 1: Write the arm 1 prompt**

No performance vocabulary anywhere — no "index", "fast", "slow", "scale", "optimize", "efficient", "production", "performance". Field names come from `oracle/schema.sql`.

```
# experiments/indexing/prompt-arm1.txt
Build a TypeScript project in the current directory using Prisma with SQLite.

It covers retail inventory for a chain of stores. The data model is:

- Store: store key, name, region, state, city, zip code, latitude, longitude, tier.
- ProductType: name.
- ProductFamily: name, belongs to a ProductType.
- ProductLine: name, belongs to a ProductFamily.
- Brand: brand name.
- Product: SKU number, product name, belongs to a ProductLine and to a Brand.
- InventoryDaily: one row per snapshot date, store and product. Carries cost per unit,
  units on hand, units on order, units in transit, units received, units shrunk, reorder
  point, max stock level, days of supply, inventory value, is stockout, is low stock,
  lost sales units, lost sales value, lead time days, merchant id.
- InventoryAdjustment: store, product, who adjusted it, when, units delta, reason,
  serial number.

Write prisma/schema.prisma, and a src/queries.ts exporting one function per page below:

1. A store's current inventory: every product held at one store on the latest snapshot
   date, returning product name, brand name, product family name and units on hand.
2. Low stock across a region: every product flagged low stock at any store in a region,
   returning store name, product name and units on hand.
3. A product's adjustment history at a store, returning who made each adjustment.
4. A regional summary: total inventory value per store for a given snapshot date.
```

- [ ] **Step 2: Write the arm 2 prompt**

Copy the whole arm 1 text into `prompt-arm2.txt` and append one final line:

```
This will run in production against several years of daily snapshots for hundreds of stores.
```

- [ ] **Step 3: Verify the prompts are clean**

```bash
grep -niE 'index|fast|slow|scale|optimi|efficien|perform|query plan|n\+1' experiments/indexing/prompt-arm1.txt
```

Expected: no output.

```bash
grep -niE 'index|fast|slow|optimi|efficien|perform|query plan|n\+1' experiments/indexing/prompt-arm2.txt
```

Expected: no output. Arm 2 legitimately contains "production" and that is the entire manipulation. If any other term appears, the trial would measure the prompt rather than the default — rewrite the line.

- [ ] **Step 4: Write the harness**

```bash
#!/usr/bin/env bash
# experiments/indexing/runTrials.sh — run N trials per arm in fresh directories.
#
# Each trial runs in an empty directory so no project CLAUDE.md, no repo files and no
# prior session state can influence it. The user-level ~/.claude/CLAUDE.md still applies
# and is committed alongside the results for disclosure.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRIALS="${TRIALS:-5}"
RUNS="$HERE/runs"

for arm in 1 2; do
  for trial in $(seq 1 "$TRIALS"); do
    dir="$RUNS/arm${arm}-trial${trial}"
    if [ -d "$dir" ]; then
      echo "skip $dir (exists)"
      continue
    fi
    mkdir -p "$dir"
    echo "running arm${arm} trial${trial}"
    ( cd "$dir" && claude -p "$(cat "$HERE/prompt-arm${arm}.txt")" \
        --dangerously-skip-permissions > transcript.txt 2>&1 ) || \
      echo "arm${arm} trial${trial} exited non-zero; see $dir/transcript.txt"
  done
done

echo "done. results under $RUNS"
```

A failed trial is left in place with its transcript rather than deleted. It is counted as ungradeable in the results, not silently dropped.

- [ ] **Step 5: Write the experiment README**

```markdown
# The index-count test

Question: given this domain and a set of queries, does an agent declare the indexes a
human who knew the access pattern declared?

The oracle is `../../oracle/schema.sql`, which declares 17 tables and exactly 4 indexes:

    idx_assignments_user   (user_id, status)
    idx_permissions_role   (role_id)
    idx_inventory_store    (store_id, snapshot_date)
    idx_adj_store          (store_id, product_id)

Three are composite, and the column order encodes the access pattern. Roughly thirty
other REFERENCES columns are left unindexed on purpose.

Only the inventory half of that schema is in scope here — the RBAC tables are not in the
prompt — so the comparison is against `idx_inventory_store` and `idx_adj_store`.

`control/` establishes what Prisma emits from a schema declaring no indexes at all. Read
`control/CONTROL.md` before reading any trial number.

Method: 5 trials per arm, each in an empty directory, via `claude -p`. Arm 1 asks for the
schema and the queries. Arm 2 appends one sentence about running in production. No
performance vocabulary appears in either prompt.

Disclosure: the user-level `~/.claude/CLAUDE.md` is in effect for every trial; its
contents at the time are in `claude-md-at-time-of-run.txt`. Trials ran with
`--dangerously-skip-permissions` so file writes were not gated.

Reproduce:

    TRIALS=5 ./runTrials.sh
    node --experimental-strip-types tally.ts
```

- [ ] **Step 6: Commit**

```bash
chmod +x experiments/indexing/runTrials.sh
git add experiments/indexing/
git commit -m "Add the index-count test harness and prompts"
```

---

### Task 4: Run the trials and grade them

**Files:**
- Create: `experiments/indexing/tally.ts`
- Create: `experiments/indexing/tally.test.ts`
- Create: `experiments/indexing/claude-md-at-time-of-run.txt`
- Create: `experiments/indexing/metrics.duckdb` (generated, committed — it is the evidence)
- Create: `experiments/indexing/summary.txt`
- Create: `experiments/indexing/RESULTS.md`
- Create: `experiments/indexing/runs/` (generated)

**Interfaces:**
- Consumes: `parseIndexes` from Task 1, the control count from Task 2.
- Produces: `grade(indexes: ParsedIndex[]): Grade` where `Grade` is `{ inventoryDaily: Verdict; adjustments: Verdict; totalIndexes: number; compositeCount: number }` and `Verdict` is `"match" | "wrong-order" | "partial" | "missing"`. Also `extractDdl(projectDir: string): string` and `recordMetrics(rows: TrialRow[], dbPath: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```typescript
// experiments/indexing/tally.test.ts
import { describe, expect, it } from "vitest";
import { grade } from "./tally.ts";

describe("grade", () => {
  it("scores an exact composite match", () => {
    const result = grade([
      { table: "inventorydaily", columns: ["storeid", "snapshotdate"] },
    ]);
    expect(result.inventoryDaily).toBe("match");
  });

  it("distinguishes reversed column order from a match", () => {
    const result = grade([
      { table: "inventorydaily", columns: ["snapshotdate", "storeid"] },
    ]);
    expect(result.inventoryDaily).toBe("wrong-order");
  });

  it("scores a single-column index on the right table as partial", () => {
    const result = grade([{ table: "inventorydaily", columns: ["storeid"] }]);
    expect(result.inventoryDaily).toBe("partial");
  });

  it("scores no index on the fact table as missing", () => {
    const result = grade([{ table: "product", columns: ["brandid"] }]);
    expect(result.inventoryDaily).toBe("missing");
  });

  it("matches table names regardless of snake or pascal casing", () => {
    const result = grade([
      { table: "inventory_daily", columns: ["store_id", "snapshot_date"] },
    ]);
    expect(result.inventoryDaily).toBe("match");
  });

  it("counts composite indexes separately from single-column ones", () => {
    const result = grade([
      { table: "inventorydaily", columns: ["storeid", "snapshotdate"] },
      { table: "product", columns: ["brandid"] },
    ]);
    expect(result.compositeCount).toBe(1);
    expect(result.totalIndexes).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./tally.ts`.

- [ ] **Step 3: Write the implementation**

```typescript
// experiments/indexing/tally.ts
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

function main(): void {
  const runsDir = new URL("./runs/", import.meta.url).pathname;
  const rows: string[] = [
    "| run | total | composite | inventory_daily | adjustments |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const run of readdirSync(runsDir).sort()) {
    const dir = join(runsDir, run);
    const ddl = extractDdl(dir);
    writeFileSync(join(dir, "extracted.sql"), ddl);
    if (ddl === "") {
      rows.push(`| ${run} | ungradeable | ungradeable | ungradeable | ungradeable |`);
      continue;
    }
    const result = grade(parseIndexes(ddl));
    rows.push(
      `| ${run} | ${result.totalIndexes} | ${result.compositeCount} | ` +
        `${result.inventoryDaily} | ${result.adjustments} |`,
    );
  }
  console.log(rows.join("\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 12 passed.

- [ ] **Step 5: Commit the tooling before running anything**

```bash
git add experiments/indexing/tally.ts experiments/indexing/tally.test.ts
git commit -m "Add trial grading, one test per failure mode"
```

- [ ] **Step 6: Record the disclosure file and run the trials**

```bash
cp ~/.claude/CLAUDE.md experiments/indexing/claude-md-at-time-of-run.txt
TRIALS=5 ./experiments/indexing/runTrials.sh
```

Ten headless sessions; this takes a while. Do not walk away — a trial that errors records why in its `transcript.txt` and must be counted as ungradeable rather than rerun until it behaves.

- [ ] **Step 7: Tally**

```bash
node --experimental-strip-types experiments/indexing/tally.ts | tee experiments/indexing/tally-output.md
```

If `node --experimental-strip-types` errors on this Node build, use `npx tsx experiments/indexing/tally.ts` and record which one worked — Task 7's hook command has to use the same mechanism.

- [ ] **Step 8: Record the graded rows in DuckDB**

Every number the article quotes has to come out of a query, not out of a table someone typed. Add to `tally.ts` a writer that persists one row per trial.

```typescript
// appended to experiments/indexing/tally.ts
import { DuckDBInstance } from "@duckdb/node-api";

export interface TrialRow extends Grade {
  run: string;
  arm: number;
  trial: number;
  gradeable: boolean;
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
```

Parse `arm` and `trial` from the directory name (`arm2-trial4` → arm 2, trial 4) in `main()`, and call `recordMetrics(rows, "experiments/indexing/metrics.duckdb")` after the table is printed.

- [ ] **Step 9: Derive the reported numbers from queries, not by counting**

```bash
npx duckdb experiments/indexing/metrics.duckdb -c "
  SELECT arm,
         COUNT(*) FILTER (WHERE gradeable) AS n,
         COUNT(*) FILTER (WHERE NOT gradeable) AS ungradeable,
         SUM(CASE WHEN inventory_daily = 'match' THEN 1 ELSE 0 END) AS exact_match,
         SUM(CASE WHEN inventory_daily = 'partial' THEN 1 ELSE 0 END) AS partial,
         SUM(CASE WHEN inventory_daily = 'wrong-order' THEN 1 ELSE 0 END) AS wrong_order,
         SUM(CASE WHEN inventory_daily = 'missing' THEN 1 ELSE 0 END) AS missing,
         ROUND(AVG(total_indexes), 2) AS avg_indexes
  FROM trials GROUP BY arm ORDER BY arm;
" | tee experiments/indexing/summary.txt
```

If `npx duckdb` is unavailable, run the same SQL through `@duckdb/node-api` in a short script and commit the script. Do not retype the numbers by hand — that is the failure mode this step exists to remove.

- [ ] **Step 10: Write RESULTS.md**

Contents: the finding in one sentence at the top, whichever way it went. The per-arm summary **pasted from `summary.txt`**, plus the per-run table. The exact `n` per arm and the count of ungradeable runs. The control number from Task 2 and whether it was subtracted. The query used, so a reader can re-derive every figure. Three to five verbatim transcript quotes where a session explained — or did not explain — an indexing choice.

If the sessions matched the oracle, say so plainly. That outcome removes a section from the article and the article will explain why it was removed.

- [ ] **Step 11: Commit**

```bash
git add experiments/indexing/
git commit -m "Run the index-count test: n=5 per arm, metrics in DuckDB, raw transcripts"
```

---

### Task 5: Promote one generated app to `app/`

**Files:**
- Create: `app/` (copied from one trial)
- Create: `app/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the trial directories from Task 4.
- Produces: `app/`, containing a Prisma project whose `src/queries.ts` is the corpus Task 8 scans. The promoted code is **not** hand-corrected — that is the point of it.

- [ ] **Step 1: Choose the trial to promote**

Pick the arm 1 trial closest to the median on total index count that produced a `src/queries.ts`. Record the choice and the reason in `app/README.md`. Do not pick the worst one; a cherry-picked disaster is not evidence, and this will be read by people who can check.

- [ ] **Step 2: Copy it in, unmodified**

```bash
cp -r experiments/indexing/runs/<chosen-run>/. app/
rm -rf app/transcript.txt app/extracted.sql app/node_modules app/*.db
```

- [ ] **Step 3: Write app/README.md**

State plainly: this application was generated by a headless session as part of the index-count test; it is committed **as generated**; it is deliberately not corrected because it is the corpus the N+1 scanner reads. Name the trial it came from and why that one. Note that it models the inventory half of `oracle/schema.sql` only.

- [ ] **Step 4: Verify there is something to scan**

```bash
find app -name '*.ts' -not -path '*/node_modules/*' | head
```

Expected: at least `app/src/queries.ts`. If the promoted project produced no TypeScript query code, that trial is not a usable corpus — choose the next-closest-to-median trial and repeat from Step 2.

- [ ] **Step 5: Add a line to the repo README**

Read `README.md` first and match its existing format. Add `app/` to whatever structure list it carries, described as the generated application used as the scanner's corpus.

- [ ] **Step 6: Commit**

```bash
git add app/ README.md
git commit -m "Promote a generated app to app/ as the scanner's corpus, uncorrected"
```

---

### Task 6: The N+1 scanner

**Files:**
- Create: `.claude/skills/performance/scanNPlusOne.ts`
- Create: `.claude/skills/performance/scanNPlusOne.test.ts`

**Interfaces:**
- Consumes: `@typescript-eslint/typescript-estree`.
- Produces: `scanSource(source: string, filename?: string): Finding[]` where `Finding` is `{ file: string; line: number; rule: Rule; message: string }` and `Rule` is `"query-in-loop" | "unincluded-relation"`. Also `scanPath(root: string): Finding[]`. Task 7's hook calls the CLI entry point.

- [ ] **Step 1: Write the failing tests**

```typescript
// .claude/skills/performance/scanNPlusOne.test.ts
import { describe, expect, it } from "vitest";
import { scanSource } from "./scanNPlusOne.ts";

const rules = (source: string) => scanSource(source).map((f) => f.rule).sort();

describe("scanSource", () => {
  it("flags an awaited query inside a for-of loop", () => {
    const source = `
      for (const store of stores) {
        const items = await prisma.inventoryDaily.findMany({ where: { storeId: store.storeId } });
      }
    `;
    expect(rules(source)).toEqual(["query-in-loop"]);
  });

  it("flags an awaited query inside a map callback", () => {
    const source = `
      const counts = await Promise.all(
        products.map((p) => prisma.inventoryAdjustment.count({ where: { productId: p.productId } }))
      );
    `;
    expect(rules(source)).toEqual(["query-in-loop"]);
  });

  it("flags a relation walk on a findMany result that declared no include", () => {
    const source = `
      const items = await prisma.inventoryDaily.findMany({ where: { storeId } });
      for (const item of items) {
        const brand = item.product.brand.brandName;
      }
    `;
    expect(rules(source)).toEqual(["unincluded-relation"]);
  });

  it("does not flag a relation walk when include was declared", () => {
    const source = `
      const items = await prisma.inventoryDaily.findMany({
        where: { storeId },
        include: { product: { include: { brand: true } } },
      });
      for (const item of items) {
        const brand = item.product.brand.brandName;
      }
    `;
    expect(rules(source)).toEqual([]);
  });

  it("does not flag a select that names the fields", () => {
    const source = `
      const items = await prisma.inventoryDaily.findMany({
        where: { storeId },
        select: { unitsOnHand: true, product: { select: { productName: true } } },
      });
      for (const item of items) {
        const name = item.product.productName;
      }
    `;
    expect(rules(source)).toEqual([]);
  });

  it("does not flag a loop that runs no query and walks no relation", () => {
    const source = `
      for (const n of [1, 2, 3]) {
        console.log(n);
      }
    `;
    expect(rules(source)).toEqual([]);
  });

  it("does not flag a single query outside any loop", () => {
    const source = `const items = await prisma.inventoryDaily.findMany({ where: { storeId } });`;
    expect(rules(source)).toEqual([]);
  });

  it("reports file and line", () => {
    const source = "for (const s of stores) {\n  await prisma.product.findUnique({ where: { id: s.id } });\n}";
    const findings = scanSource(source, "queries.ts");
    expect(findings[0].file).toBe("queries.ts");
    expect(findings[0].line).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./scanNPlusOne.ts`.

- [ ] **Step 3: Write the implementation**

```typescript
// .claude/skills/performance/scanNPlusOne.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@typescript-eslint/typescript-estree";

export type Rule = "query-in-loop" | "unincluded-relation";

export interface Finding {
  file: string;
  line: number;
  rule: Rule;
  message: string;
}

const QUERY_METHODS = new Set([
  "findMany", "findUnique", "findFirst", "findUniqueOrThrow", "findFirstOrThrow",
  "count", "aggregate", "groupBy", "create", "update", "upsert", "delete",
]);
const ITERATING_METHODS = new Set(["map", "forEach", "flatMap", "filter", "reduce"]);
const LOOP_TYPES = new Set([
  "ForStatement", "ForOfStatement", "ForInStatement", "WhileStatement", "DoWhileStatement",
]);

type Node = Record<string, any>;

function walk(node: Node | null, visit: (n: Node) => void): void {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === "object") walk(value as Node, visit);
  }
}

/** The method name of a call like prisma.model.findMany(...). */
function queryMethodName(node: Node): string | null {
  if (node.type !== "CallExpression") return null;
  const callee = node.callee;
  if (callee?.type !== "MemberExpression" || callee.property?.type !== "Identifier") return null;
  const name = callee.property.name as string;
  return QUERY_METHODS.has(name) ? name : null;
}

/** Bodies that execute once per element: real loops, and callbacks to map/forEach/etc. */
function iteratedBodies(tree: Node): Node[] {
  const bodies: Node[] = [];
  walk(tree, (node) => {
    if (LOOP_TYPES.has(node.type) && node.body) bodies.push(node.body);
    if (node.type === "CallExpression") {
      const callee = node.callee;
      if (
        callee?.type === "MemberExpression" &&
        callee.property?.type === "Identifier" &&
        ITERATING_METHODS.has(callee.property.name)
      ) {
        for (const argument of node.arguments ?? []) {
          if (
            argument.type === "ArrowFunctionExpression" ||
            argument.type === "FunctionExpression"
          ) {
            bodies.push(argument.body);
          }
        }
      }
    }
  });
  return bodies;
}

/** Variables holding a findMany/findFirst result that named neither include nor select. */
function unincludedResults(tree: Node): Set<string> {
  const names = new Set<string>();
  walk(tree, (node) => {
    if (node.type !== "VariableDeclarator" || node.id?.type !== "Identifier") return;
    let init = node.init;
    if (init?.type === "AwaitExpression") init = init.argument;
    if (!queryMethodName(init ?? {})) return;
    const options = init.arguments?.[0];
    const keys =
      options?.type === "ObjectExpression"
        ? (options.properties ?? [])
            .filter((p: Node) => p.key?.type === "Identifier")
            .map((p: Node) => p.key.name as string)
        : [];
    if (!keys.includes("include") && !keys.includes("select")) names.add(node.id.name);
  });
  return names;
}

/** Root identifier of a member chain: item.product.brand -> "item", depth 2. */
function chainRoot(node: Node): { name: string; depth: number } | null {
  let depth = 0;
  let current: Node = node;
  while (current.type === "MemberExpression") {
    depth += 1;
    current = current.object;
  }
  return current.type === "Identifier" ? { name: current.name, depth } : null;
}

export function scanSource(source: string, filename = "<memory>"): Finding[] {
  let tree: Node;
  try {
    tree = parse(source, { loc: true, jsx: false }) as unknown as Node;
  } catch {
    return [];
  }

  const findings: Finding[] = [];
  const unincluded = unincludedResults(tree);

  for (const body of iteratedBodies(tree)) {
    walk(body, (node) => {
      const method = queryMethodName(node);
      if (method) {
        findings.push({
          file: filename,
          line: node.loc?.start.line ?? 0,
          rule: "query-in-loop",
          message:
            `Query .${method}() runs once per iteration. Fetch the set in one query, ` +
            `or use include to load the relation with its parent.`,
        });
        return;
      }
      if (node.type === "MemberExpression" && node.object?.type === "MemberExpression") {
        const root = chainRoot(node);
        if (root && root.depth >= 2 && !unincluded.has(root.name)) return;
        findings.push({
          file: filename,
          line: node.loc?.start.line ?? 0,
          rule: "unincluded-relation",
          message:
            "Relation read on a record fetched without include or select. Each access " +
            "may issue its own query.",
        });
      }
    });
  }

  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.file}:${finding.line}:${finding.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function scanPath(root: string): Finding[] {
  const findings: Finding[] = [];
  const skip = new Set(["node_modules", ".git", "migrations", "dist", "runs"]);
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) visit(full);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry) && !/\.test\./.test(entry)) {
        findings.push(...scanSource(readFileSync(full, "utf8"), full));
      }
    }
  };
  visit(root);
  return findings;
}

function main(): void {
  const root = process.argv[2] ?? "app";
  const findings = scanPath(root);
  if (findings.length === 0) {
    console.log(`N+1 scan: no candidates in ${root}`);
    return;
  }
  console.log(`N+1 scan: ${findings.length} candidate(s) in ${root}`);
  for (const finding of findings) {
    console.log(`  ${finding.file}:${finding.line}  [${finding.rule}] ${finding.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 20 passed.

The likely failure is the relation rule over-firing — `console.log` reads as a two-level member chain, and a chain rooted at a variable that is not a query result must not be flagged. If a test fails because a rule fires too widely, **tighten the rule; do not relax the test.** A scanner that flags everything is worthless, and the article claims this one is usable.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/performance/scanNPlusOne.ts .claude/skills/performance/scanNPlusOne.test.ts
git commit -m "Add the N+1 candidate scanner, one test per rule"
```

---

### Task 7: The skill and the SessionStart hook

**Files:**
- Create: `.claude/skills/performance/SKILL.md`
- Create: `.claude/settings.json`
- Create: `docs/hook-verification.md`

**Interfaces:**
- Consumes: `scanNPlusOne.ts` from Task 6.
- Produces: a hook that fires on session start and after compaction, and a recorded observation that it fired.

- [ ] **Step 1: Confirm the run mechanism**

```bash
node --experimental-strip-types .claude/skills/performance/scanNPlusOne.ts app
```

If that errors, use `npx tsx .claude/skills/performance/scanNPlusOne.ts app` and use that form in both the skill and the hook. Record which worked.

- [ ] **Step 2: Write the skill**

```markdown
---
name: performance
description: Use when writing or reviewing ORM query code, when adding a query that reads related records, or when asked to scan for N+1 queries. Reports N+1 candidates with file and line.
---

# Performance

## Scan

    npm run scan

Reports two rules:

- `query-in-loop` — a query method called once per iteration of a loop or a map callback.
- `unincluded-relation` — a relation read on a record fetched without `include` or `select`.

These are **candidates, not proofs**. Read each one and decide. A loop over three
configuration rows is fine; the same shape over 31,500 inventory rows is not.

## When writing query code

An index is a claim about how the data will be read, paid for in writes and in storage.
Before adding a query that filters or orders on a column, say which access pattern it
serves — and if no index serves it, say that too. An absent index reads identically to a
considered decision not to have one, so the decision has to be written down.

Prefer one query that fetches the set to a query per record. `include` to load a relation
with its parent; `select` when only some fields are needed.
```

- [ ] **Step 3: Write the hook config**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node --experimental-strip-types .claude/skills/performance/scanNPlusOne.ts app"
          }
        ]
      },
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "node --experimental-strip-types .claude/skills/performance/scanNPlusOne.ts app"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Verify the matcher names against current documentation**

Consult the hooks documentation for the installed version (2.1.220). Confirm that `SessionStart` accepts `startup` and `compact` matchers, and confirm no `PostCompact` event exists. Record what was checked and what it said.

If the matcher names differ from this plan, **the plan is wrong and the tool is right.** Fix the config, and fix the corresponding constraint in `docs/superpowers/specs/2026-08-02-indexing-article-design.md` — the article is going to state these names to readers who will copy them.

- [ ] **Step 5: Fire the hook and observe it**

Start a fresh session in this repo and capture what the hook emitted. Then trigger a compaction and capture that.

- [ ] **Step 6: Record the observation**

Write `docs/hook-verification.md`: the Claude Code version, the exact config, verbatim output from the startup firing, verbatim output from the compact firing, and the date. This file is the evidence for every hook claim in the article. If the compact firing could not be observed, write that down — and the article will describe only the startup matcher.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/performance/SKILL.md .claude/settings.json docs/hook-verification.md
git commit -m "Wire the N+1 scan to SessionStart on startup and compact, with observed output"
```

---

### Task 8: Scan the corpus and record what it caught

**Files:**
- Create: `experiments/indexing/SCAN-RESULTS.md`
- Create: `experiments/indexing/scan-output.txt`

**Interfaces:**
- Consumes: `scanPath` from Task 6, `app/` from Task 5.
- Produces: the findings the article's section 7 quotes.

- [ ] **Step 1: Run the scanner on the promoted app**

```bash
npm run scan | tee experiments/indexing/scan-output.txt
```

- [ ] **Step 2: Judge every candidate**

Open each finding at its line and decide: real N+1, or false positive. Record both counts and the reasoning per finding. A scanner with a stated false positive rate is credible; one reported as perfect is not.

- [ ] **Step 3: Write SCAN-RESULTS.md**

The raw output, the true/false split with per-finding reasoning, and — for the most illustrative real finding — the actual code and the row count it multiplies against. Take the row count from `expected/`; if the relevant count is not there, query `oracle/rbac.db` and show the query.

- [ ] **Step 4: Commit**

```bash
git add experiments/indexing/SCAN-RESULTS.md experiments/indexing/scan-output.txt
git commit -m "Scan the promoted app: findings, and which were false positives"
```

---

### Task 9: Verify the storage-engine claims

**Files:**
- Create: `docs/posts/indexing-sources.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the citations backing the article's section 3.

- [ ] **Step 1: Check Snowflake's current documentation**

Confirm how Snowflake describes its storage — micro-partitions, per-column metadata within each micro-partition, clustering keys — and whether it offers any B-tree-style secondary index feature at the tier being described. Note the date checked.

- [ ] **Step 2: Check how Sigma describes its execution model**

Confirm the warehouse-native description: queries pushed down to the customer's warehouse, no extract layer. Note the date checked.

- [ ] **Step 3: Check what SQLite does with the oracle's indexes**

```bash
sqlite3 oracle/rbac.db "EXPLAIN QUERY PLAN SELECT * FROM inventory_daily WHERE store_id = (SELECT store_id FROM stores LIMIT 1) AND snapshot_date > '2026-01-01';"
sqlite3 oracle/rbac.db "SELECT COUNT(*) FROM inventory_daily;"
```

Record the plan verbatim, including whether it names `idx_inventory_store`. This is the one engine claim the article can demonstrate from a file in the repo rather than cite.

- [ ] **Step 4: Run the same query on DuckDB and record what differs**

Same rows, one embedded row store and one embedded columnar engine. This turns section 3 from a citation into a demonstration a reader can reproduce on a laptop.

```bash
npx duckdb experiments/indexing/engines.duckdb -c "
  CREATE OR REPLACE TABLE inventory_daily AS
    SELECT \"Snapshot Date\" AS snapshot_date,
           \"Store Id\"      AS store_id,
           \"Product Id\"    AS product_id,
           \"Units on Hand\" AS units_on_hand,
           \"Inventory Value\" AS inventory_value
    FROM read_csv_auto('data/inventory_daily.csv');
  SELECT COUNT(*) AS rows FROM inventory_daily;
  EXPLAIN SELECT store_id, SUM(inventory_value)
          FROM inventory_daily
          WHERE store_id = (SELECT store_id FROM inventory_daily LIMIT 1)
            AND snapshot_date > '2026-01-01'
          GROUP BY store_id;
" | tee experiments/indexing/duckdb-explain-before.txt
```

Then create the equivalent index and run the identical `EXPLAIN` again:

```bash
npx duckdb experiments/indexing/engines.duckdb -c "
  CREATE INDEX idx_inventory_store ON inventory_daily (store_id, snapshot_date);
  EXPLAIN SELECT store_id, SUM(inventory_value)
          FROM inventory_daily
          WHERE store_id = (SELECT store_id FROM inventory_daily LIMIT 1)
            AND snapshot_date > '2026-01-01'
          GROUP BY store_id;
" | tee experiments/indexing/duckdb-explain-after.txt
```

Record the row count and diff the two plans. **State only what the output supports.** DuckDB does support `CREATE INDEX` — it builds ART indexes and uses them for point lookups and constraints — so the claim is not "DuckDB has no indexes." The defensible version, if the output bears it out, is that for this analytical scan the plan is unchanged and the engine relies on automatic zone maps, whereas SQLite's plan for the comparable query names `idx_inventory_store`. If the plans *do* differ, that is the finding and the article says that instead.

If `npx duckdb` is unavailable, DuckDB can read the oracle directly with `INSTALL sqlite; LOAD sqlite; ATTACH 'oracle/rbac.db' AS lab (TYPE sqlite);` — but that needs network for the extension. The CSV path above works offline and uses the same source rows.

- [ ] **Step 5: Write the sources file**

One line per engine claim the article makes: the URL, the date checked, and the vendor's exact wording. Any claim without a line here does not appear in the article. Claims demonstrated from this repo — the SQLite plan and the DuckDB pair — cite the committed output file rather than a URL.

- [ ] **Step 6: Commit**

```bash
git add docs/posts/indexing-sources.md experiments/indexing/duckdb-explain-*.txt
git commit -m "Cite or demonstrate every storage-engine claim before making it"
```

---

### Task 10: Write the article

**Files:**
- Create: `docs/posts/indexing.txt`

**Interfaces:**
- Consumes: `experiments/indexing/RESULTS.md`, `experiments/indexing/control/CONTROL.md`, `experiments/indexing/SCAN-RESULTS.md`, `docs/hook-verification.md`, `docs/posts/indexing-sources.md`.
- Produces: the article.

- [ ] **Step 1: Re-read the format rules**

Read `docs/posts/README.md`, sections "Format, which is not a preference" and "Accuracy constraints", before writing a line. Read `docs/posts/05-corpus-supply-chain.txt` for the register.

- [ ] **Step 2: Draft to the outline**

1. Open on *old school in an age of new school*, then undercut it: the old school is not nostalgia, it is the part that stopped failing loudly enough to teach anyone.
2. What an index is: a claim about how the data will be read, paid for in writes and storage. Not "makes queries fast."
3. Why some engines have them and some do not. A row store seeking one row versus a columnar engine scanning a column — demonstrated, not cited: the same rows in SQLite and in DuckDB, both plans committed, per Task 9 steps 3 and 4. Snowflake and Sigma arrive after that as the warehouse-scale case, with citations. "Add an index" is engine-specific advice, not portable advice.
4. The gap that used to teach you: correctness and scalability failed together, on your machine, early. They do not any more.
5. We trust they build indexes. The omitted index is invisible — it renders identically to a considered decision not to index. Then the control result, then the finding from `RESULTS.md` with `n` stated.
6. N+1 concretely: `Product → ProductLine → ProductFamily → ProductType` plus `→ Brand`, against `My Inventory`'s 31,500 rows for a store manager, and the query-per-row.
7. The fix is a hook, not a resolution. The skill, `SessionStart` on `startup` and `compact`, why compaction is the moment the reasoning evaporates, and what the scan caught per `SCAN-RESULTS.md` — including the false positives.
8. Close on the two tests a reader can run this afternoon.

Every number comes from a committed file. If a paragraph wants a number that is not in one, cut the paragraph or go measure it.

- [ ] **Step 3: Check the format mechanically**

```bash
grep -nE '^\s+|\*\*|^#|^>' docs/posts/indexing.txt
```

Expected: no output. Any hit is an indented line, Markdown bold, a heading or a blockquote — each of which pastes as literal characters.

```bash
grep -niE 'organis|behaviour|modelling|analyse|optimis' docs/posts/indexing.txt
wc -c docs/posts/indexing.txt
```

Expected: no spelling hits; character count in the range of `04` and `05`, roughly 11,000–14,000. Well under means a section is thin; well over means it needs cutting.

- [ ] **Step 4: Check every claim against its source**

Go through the draft line by line. For each factual assertion, name the committed file it came from. Any assertion with no file is cut or measured. Pay particular attention to the present tense: no sentence may describe something operating that was not run.

- [ ] **Step 5: Commit**

```bash
git add docs/posts/indexing.txt
git commit -m "Draft the indexing article from the measured results"
```

---

### Task 11: Document the reasoning and close out

**Files:**
- Modify: `docs/posts/README.md`
- Modify: `docs/superpowers/specs/2026-08-02-indexing-article-design.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the record of why the piece is shaped the way it is, in the place the other pieces keep theirs.

- [ ] **Step 1: Add the file to the README's file list**

Add `indexing.txt` to the list at the top, marked standalone rather than numbered, with a one-line description.

- [ ] **Step 2: Write the "why it is shaped this way" section**

Match the existing sections. Cover: why it sits outside the numbered series; that the evidence was gathered before the article was written; the control result and why a control was needed at all; what the index-count test found, whichever way it went; the scanner's false positive rate; the Prisma-versus-SQL split between the two artifacts; and the `PostCompact` correction — a reader who copies the wrong hook name gets silence rather than an error, which is the same silent-failure class the piece is about.

- [ ] **Step 3: Add anything discovered to the accuracy constraints**

If a claim was weakened during Task 10's line-by-line check, record it and why, the way the existing constraints are recorded.

- [ ] **Step 4: Mark the spec built**

Change `Status: approved, not yet built` to `Status: built <date>` and note where implementation diverged from design — especially if the index-count test came back boring and a section was cut.

- [ ] **Step 5: Run the full suite one last time**

```bash
npm test
```

Expected: all tests pass. Report the actual count.

- [ ] **Step 6: Commit**

```bash
git add docs/posts/README.md docs/superpowers/specs/2026-08-02-indexing-article-design.md
git commit -m "Record why the indexing piece is shaped the way it is"
```
