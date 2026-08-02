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
- Hook names and matchers are verified by firing them and observing output, never recalled. **Correction, verified against the installed 2.1.220 extension: `PostCompact` DOES exist** as a hook event, alongside `PreCompact` and `SessionStart`. An earlier version of this plan asserted it does not — that was wrong, and the article must not repeat it. What this project uses is `SessionStart` with matchers `startup` and `compact`, both of which were observed firing (`docs/hook-verification.md`). The article may state what was observed and must make no claim about which events do or do not exist beyond that.
- `31,500` is `My Inventory` for a store manager, per `expected/` and `VERIFY.md`. It is **not** the agent's corpus; that number is 150 / 450.
- Persona roles come from `data/roles.csv` verbatim. Priya is **Regional Manager**, not "regional director".
- Claims about Snowflake or Sigma storage are phrased as what that engine does, checked against current published documentation, never as a general claim about columnar databases.
- **DuckDB supports `CREATE INDEX`.** The article never says it has no indexes. The permitted claim is the narrow, measured one about what the plan does for an analytical scan, backed by committed `EXPLAIN` output.
- Every figure in the article comes out of a query against `experiments/indexing/metrics.duckdb` or a committed output file. No number is transcribed by hand.
- **The horsepower section states no measured cost figure.** No benchmark of instance classes was run and no cloud pricing was checked, so the argument stays structural — hardware buys a constant factor, an index changes the shape of the work, and an N+1 is round trips rather than compute. Any dollar amount or speedup multiple would be invented. If a figure is wanted, measure it and cite the file, like everything else.
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
    "@duckdb/node-api": "1.5.5-r.3",
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

**On the DuckDB dependency, verified 2026-08-02:** `@duckdb/node-api` publishes only prerelease-tagged versions (`1.5.5-r.3`, `1.4.5-r.1`), so a caret range such as `^1.1.0` can never resolve — pin the exact version above. There is also **no DuckDB CLI on this machine and no npm package that provides one**; `npx duckdb` fails. Every DuckDB query in this plan therefore runs through `@duckdb/node-api` via the small runner built in Task 4, not through a CLI.

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

- [ ] **Step 9: Build the DuckDB query runner**

There is no DuckDB CLI available, so every query in this plan goes through this one script. It takes a database path and SQL — either as an argument or on stdin — runs each statement, and prints the last result as a table.

```typescript
// experiments/indexing/duckdbQuery.ts
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
```

Add to `package.json` scripts: `"duckdb": "node --experimental-strip-types experiments/indexing/duckdbQuery.ts"`.

- [ ] **Step 10: Derive the reported numbers from queries, not by counting**

```bash
npm run duckdb -- experiments/indexing/metrics.duckdb "
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

Do not retype the numbers by hand — that is the failure mode this step exists to remove.

- [ ] **Step 11: Write RESULTS.md**

Contents: the finding in one sentence at the top, whichever way it went. The per-arm summary **pasted from `summary.txt`**, plus the per-run table. The exact `n` per arm and the count of ungradeable runs. The control number from Task 2 and whether it was subtracted. The query used, so a reader can re-derive every figure. Three to five verbatim transcript quotes where a session explained — or did not explain — an indexing choice.

If the sessions matched the oracle, say so plainly. That outcome removes a section from the article and the article will explain why it was removed.

- [ ] **Step 12: Commit**

```bash
git add experiments/indexing/
git commit -m "Run the index-count test: n=5 per arm, metrics in DuckDB, raw transcripts"
```

**Verify the API before trusting the sketches above.** `@duckdb/node-api` is pinned at `1.5.5-r.3` and its surface is not stable across releases — the `DuckDBInstance.create` / `connect` / `runAndReadAll` / `getRowObjects` calls used in Steps 8 and 9 are written from expectation, not from this version's documentation. Check them against the installed package's own types in `node_modules/@duckdb/node-api` and adjust. If a call does not exist, the sketch is wrong and the package is right.

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

- [ ] **Step 1: Run the scanner on ALL TEN trials, not only the promoted app**

Revised 2026-08-02. Two independent human reads of `app/src/queries.ts` found no N+1 pattern in the promoted corpus, so a single-corpus scan would settle almost nothing. Ten independently generated codebases is a far better test — of the generated code and of the scanner alike.

```bash
for d in experiments/indexing/runs/*/; do
  echo "=== $(basename "$d") ==="
  node --experimental-strip-types .claude/skills/performance/scanNPlusOne.ts "$d/src" 2>&1 || true
done | tee experiments/indexing/scan-output.txt
node --experimental-strip-types .claude/skills/performance/scanNPlusOne.ts app >> experiments/indexing/scan-output.txt
```

Adjust the source subdirectory per trial if a session laid its project out differently — check first rather than assuming every trial used `src/`. A trial whose query code was not found must be reported as not scanned, never counted as clean.

`scanPath` already skips `node_modules`; confirm that it did, because the trial directories contain installed dependencies and a scan that wandered into them would produce meaningless findings.

- [ ] **Step 2: Judge every candidate**

Open each finding at its line and decide: real N+1, or false positive. Record both counts and the reasoning per finding. A scanner with a stated false positive rate is credible; one reported as perfect is not.

- [ ] **Step 3: Write SCAN-RESULTS.md**

A per-trial table — trial, files scanned, candidates found, true, false — then the raw output, the per-finding reasoning, and, for the most illustrative real finding, the actual code and the row count it multiplies against. Take the row count from `expected/`; if the relevant count is not there, query `oracle/rbac.db` and show the query.

**A zero result across all ten is a real and publishable finding**, and it must be reported as plainly as a dramatic one would be. Two independent human reads already found no N+1 in the promoted corpus, so this outcome is likely. If it happens, the honest conclusion is that these sessions wrote query code that avoids the pattern — nested `select`, one query per page — and the article says so and gives them the credit. What it must NOT do is quietly retire the scanner section, or go hunting for a corpus that fails until one is found. The scanner's own disclosed false-negative list (in the Task 6 report: `reduce` element params, destructured callback params, chained receivers, C-style `for` loops, wrapper functions, raw query methods) belongs in that write-up too, because "the scanner found nothing" and "there is nothing to find" are different claims and the piece may only make the first.

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

- [ ] **Step 1b: Check the write side, which article section 4 rests on**

Confirm how Snowflake describes the cost of small or single-row DML against micro-partitions, and confirm the current status and purpose of **Hybrid Tables (Unistore)** and **Snowpipe Streaming**. Note the date checked.

The section must be phrased as a property of a columnar, immutable-partition architecture under a write-heavy workload — never as "Snowflake is bad at writes", which is both a product verdict and a dated one now that row-oriented Hybrid Tables exist. If the documentation does not support the architectural claim in the form the article wants to make it, say so and the section gets weakened rather than the source stretched.

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
npm run duckdb -- experiments/indexing/engines.duckdb "
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
npm run duckdb -- experiments/indexing/engines.duckdb "
  CREATE INDEX idx_inventory_store ON inventory_daily (store_id, snapshot_date);
  EXPLAIN SELECT store_id, SUM(inventory_value)
          FROM inventory_daily
          WHERE store_id = (SELECT store_id FROM inventory_daily LIMIT 1)
            AND snapshot_date > '2026-01-01'
          GROUP BY store_id;
" | tee experiments/indexing/duckdb-explain-after.txt
```

Record the row count and diff the two plans. **State only what the output supports.** DuckDB does support `CREATE INDEX` — it builds ART indexes and uses them for point lookups and constraints — so the claim is not "DuckDB has no indexes." The defensible version, if the output bears it out, is that for this analytical scan the plan is unchanged and the engine relies on automatic zone maps, whereas SQLite's plan for the comparable query names `idx_inventory_store`. If the plans *do* differ, that is the finding and the article says that instead.

These run through the Task 4 runner; there is no DuckDB CLI on this machine. DuckDB could also read the oracle directly with `INSTALL sqlite; LOAD sqlite; ATTACH 'oracle/rbac.db' AS lab (TYPE sqlite);`, but that needs network for the extension — the CSV path above works offline and uses the same source rows.

`oracle/rbac.db` is gitignored and is **not** present in a fresh checkout. Rebuild it with `python3 oracle/build.py` before Step 3.

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
4. **The write side, which is what actually decides the trade.** An index is paid for on every write, so an engine's write profile governs whether the trade is worth making — and this is where the reflex to index everything breaks. Columnar analytical engines store data in immutable partitions built for bulk load and large scans, so frequent small writes are expensive in a way that has nothing to do with how fast the hardware is: a single-row change means rewriting a partition. That is the same lesson as sections 2 and 3 arriving from the opposite direction — the read plan is only half of it. **Phrase this as a property of the architecture and the workload, never as a verdict on a product.** Snowflake ships Hybrid Tables for row-oriented write-heavy work and Snowpipe Streaming for continuous ingest, so "Snowflake is bad at writes" is both a product claim and a dated one. What the article may say is what a columnar, immutable-partition store does with single-row DML, cited per Task 9.
5. The gap that used to teach you: correctness and scalability failed together, on your machine, early. They do not any more.
6. We trust they build indexes. The omitted index is invisible — it renders identically to a considered decision not to index. Then the control result, then the finding from `RESULTS.md` with `n` stated.
7. N+1 concretely: `Product → ProductLine → ProductFamily → ProductType` plus `→ Brand`, against `My Inventory`'s 31,500 rows for a store manager, and the query-per-row.
8. **Horsepower is a costly non-solution** — and this piece's own measurement is the first example. Gathering these numbers took about thirty minutes because the trials run one at a time, and the obvious reflex was to run them five at a time and be done in six. That would have been faster and worse: concurrent sessions can be throttled or served differently under load, so a degraded result correlating with position in the pool would have been a bias hidden inside numbers that still looked fine. Trading a visible cost for an invisible defect is the same move as buying hardware instead of making an access-pattern decision, and the same move as accepting generated code because it returns the right rows. Say this plainly and early in the section — a writer admitting they wanted the shortcut buys the rest of the argument. Then the general case: the reflex when a query gets slow is to raise the instance class, add a read replica, widen the pool. It works for a quarter and converts a one-line schema change into a recurring line item — paid by a different budget than the one the query was written against, which is exactly why it keeps happening. Two things make it worse than merely expensive. An index changes the shape of the work, from scanning the table to seeking part of it, so its advantage *grows* as the data grows; doubled hardware buys a constant factor that the next year of growth eats. And **an N+1 does not respond to hardware at all** — it is round trips, not compute. A faster server makes each of the queries slightly faster and still runs every one of them. That is the sharpest form of the argument and it should carry the section. **Do not overclaim:** there are real cases where more hardware is the right answer — write-heavy tables where index maintenance costs more than it saves, genuine data growth. The claim is that hardware bought *instead of* an access-pattern decision is rent paid to avoid a decision, not that scaling up is always wrong.
9. **An indexing strategy now has to account for code nobody wrote.** The classical version assumes a query set that is stable, reviewed, and changes at the speed of a release. You enumerate the access patterns and index for them. Agent-generated code breaks that assumption from both directions: new access patterns appear faster than anyone re-derives the index set, and agents also add indexes on their own initiative, which is write amplification nobody chose. So the strategy stops being a document that describes the access patterns and becomes a process that keeps re-deriving them from the code as it actually stands. That is the argument the next section pays off.
10. The fix is a hook, not a resolution. The skill, `SessionStart` on `startup` and `compact`, why compaction is the moment the reasoning evaporates, and what the scan caught per `SCAN-RESULTS.md` — including the false positives.
11. Close on the two tests a reader can run this afternoon.

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

---

### Task 12: Charts from the DuckDB metrics

Added 2026-08-02 at the user's request. Two venues: static SVG uploaded into the LinkedIn article, and a self-contained HTML page for the Cloudflare demo.

**Files:**
- Modify: `package.json` (add `@observablehq/plot`, `jsdom`; add a `charts` script)
- Create: `charts/shapeData.ts`
- Create: `charts/shapeData.test.ts`
- Create: `charts/renderCharts.ts`
- Create: `charts/out/verdict-grid.svg`, `charts/out/index-count.svg` (generated, committed)
- Create: `charts/out/charts.html` (generated, committed)

**Interfaces:**
- Consumes: `experiments/indexing/metrics.duckdb` from Task 4, and that task's DuckDB helper.
- Produces: `verdictRows(trials): VerdictRow[]` and `countRows(trials): CountRow[]`, plus the rendered files.

**The form is decided and is not a matter of taste.** `n` is 5 per arm. A bar chart of percentages would render "2 of 5" as "40%", which reads as a rate the sample cannot support. Both charts therefore plot **every individual trial**. Do not add an aggregate or summary chart, and do not compute percentages anywhere in the output.

- **Verdict grid** — one row per trial (10 rows), two columns (`inventory_daily`, `adjustments`), each cell a status chip carrying an **icon and a text label**, not color alone.
- **Index-count strip plot** — one dot per trial, `total_indexes` on one axis, faceted or colored by arm, with a reference line at the in-scope oracle target. One axis only; never a second y-scale.

**Palette, already validated — use these values verbatim, do not substitute.**

Status encoding for the verdict grid, three colors (validated 2026-08-02 with the dataviz validator, both modes):

    match        good      #0ca30c
    partial      warning   #fab219
    wrong-order  warning   #fab219  + distinct texture and label
    missing      critical  #d03b3b

The four-status set was tested first and **failed**: reserved `serious` `#ec835a` sits at ΔE 13.6 from `warning` `#fab219` under normal vision, below the floor of 15 — two categories full-colour readers cannot reliably separate. Collapsing to three raises the worst adjacent pair to ΔE 27.6 and passes CVD separation in both modes. `#fab219` carries a contrast WARN on the light surface (1.79), which **obligates** the visible icon-plus-label on every chip and the table view below; that mitigation is not optional.

Series palette for the strip plot (all checks pass, both modes):

    arm 1   light #2a78d6   dark #3987e5
    arm 2   light #eb6834   dark #d95926

Surfaces: light `#fcfcfb`, dark `#1a1a19`. Dark mode is a selected set of steps, not an automatic inversion.

- [ ] **Step 1: Add the dependencies**

```bash
npm install --save-dev @observablehq/plot jsdom
```

Add to scripts: `"charts": "node --experimental-strip-types charts/renderCharts.ts"`. If `--experimental-strip-types` was not the mechanism that worked in Task 4, use whichever one did — check the Task 4 report rather than assuming.

- [ ] **Step 2: Write the failing tests for the data shaping**

Rendering is verified by looking at it; the data shaping is verified by tests. Test `shapeData.ts` only.

```typescript
// charts/shapeData.test.ts
import { describe, expect, it } from "vitest";
import { countRows, verdictRows } from "./shapeData.ts";

const TRIALS = [
  { run: "arm1-trial1", arm: 1, trial: 1, gradeable: true, total_indexes: 2,
    composite_count: 1, inventory_daily: "match", adjustments: "missing" },
  { run: "arm2-trial1", arm: 2, trial: 1, gradeable: false, total_indexes: 0,
    composite_count: 0, inventory_daily: "missing", adjustments: "missing" },
];

describe("verdictRows", () => {
  it("emits one row per trial per target index", () => {
    expect(verdictRows(TRIALS)).toHaveLength(4);
  });

  it("maps wrong-order to the warning status, not to serious", () => {
    const rows = verdictRows([{ ...TRIALS[0], inventory_daily: "wrong-order" }]);
    expect(rows.find((r) => r.target === "inventory_daily")?.status).toBe("warning");
  });

  it("gives every row a text label so colour is never the only channel", () => {
    for (const row of verdictRows(TRIALS)) {
      expect(row.label.length).toBeGreaterThan(0);
    }
  });

  it("marks ungradeable trials rather than dropping them", () => {
    const rows = verdictRows(TRIALS).filter((r) => r.run === "arm2-trial1");
    expect(rows.every((r) => r.gradeable === false)).toBe(true);
  });
});

describe("countRows", () => {
  it("keeps every trial, including ungradeable ones", () => {
    expect(countRows(TRIALS)).toHaveLength(2);
  });

  it("computes no percentages", () => {
    const serialized = JSON.stringify(countRows(TRIALS));
    expect(serialized).not.toMatch(/percent|pct|rate/i);
  });
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npm test`. Expected: cannot resolve `./shapeData.ts`.

- [ ] **Step 4: Implement `shapeData.ts`, then see the tests pass**

Pure functions only — no DuckDB, no rendering, no file writes. `VerdictRow` carries `{ run, arm, trial, target, verdict, status, label, gradeable }`; `CountRow` carries `{ run, arm, trial, total_indexes, composite_count, gradeable }`.

- [ ] **Step 5: Render, using the real metrics**

`renderCharts.ts` reads `experiments/indexing/metrics.duckdb` through the Task 4 helper, shapes the rows, builds the two Plot figures, and renders them to SVG via jsdom (`document` supplied to Plot). Write both SVGs to `charts/out/`.

An ungradeable trial is drawn, hatched and labeled — never silently omitted. If a run is missing from the database entirely, fail loudly rather than rendering a chart that quietly has fewer than ten rows.

- [ ] **Step 6: Build the page**

`charts/out/charts.html`: both SVGs inlined, a hover tooltip in hand-written JS (Plot is not shipped to the browser and no bundler is introduced), the light and dark surfaces above wired through `prefers-color-scheme` plus a `data-theme` override, and — below the charts — **a plain HTML table of the same numbers**. The table is the required relief for the contrast WARN, not a nicety.

No external requests of any kind: no CDN, no web font, no remote image. The page must work opened from disk.

- [ ] **Step 7: Look at it**

The validator checks colour, not layout. Open the page and both SVGs and check for label collisions, clipped text, overflow, and that the dark surface actually applies. Fix what you see.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json charts/
git commit -m "Chart the trial metrics: every trial plotted, no aggregate rates"
```

---

### Task 13: Interleave the harness (serially), then replicate

Added 2026-08-02. The first run (Task 4) executed arm 1 entirely, then arm 2, sequentially over roughly half an hour. That makes arm order confounded with time-of-run — rate limiting, machine load, or model-side serving variance across the window cannot be separated from the arm effect. At n=5 that is a real limitation. This task removes it rather than footnoting it.

**Files:**
- Modify: `experiments/indexing/runTrials.sh`
- Create: `experiments/indexing/runs2/` (the replication)
- Modify: `experiments/indexing/RESULTS.md`
- Modify: `experiments/indexing/README.md`

**Interfaces:**
- Consumes: the prompts from Task 3, `tally.ts` and `recordMetrics` from Task 4.
- Produces: a second `trials` table (or a `run_batch` column) in `metrics.duckdb` covering the replication.

- [ ] **Step 1: Rewrite the runner to interleave — and keep it serial**

The confound is arm ORDER, not serial execution, and the two fixes are separable. Build the full work list interleaved by arm — `arm1-trial1, arm2-trial1, arm1-trial2, arm2-trial2, …` — and execute it **one trial at a time**. That removes the confound entirely while changing nothing about the conditions each session runs under.

`PARALLEL` defaults to **1** and serial is the canonical mode. Concurrency is available as an opt-in for someone who just wants to watch it work, and the README must say plainly that the published numbers were produced serially. The reason is not politeness about rate limits: concurrent sessions can be throttled or served differently under load, and a failure or a degraded response that correlates with position in the pool is a bias of exactly the kind this task exists to remove — but harder to detect, because it hides inside results that look fine. Trading a visible confound for an invisible one is not a fix.

Preserve all three existing behaviors — skip an existing run directory, leave a failed trial in place with its transcript, never retry. Verify with `bash -n` and by inspecting the generated work list before running anything.

- [ ] **Step 2: Confirm the interleaving before spending any sessions**

Print the work list with execution disabled and check by eye that arms alternate. A pool that silently runs all of one arm first has fixed nothing.

- [ ] **Step 3: Run the replication into a separate directory**

Write to `runs2/`, leaving `runs/` untouched — the first run stays on disk as the pilot, and the promoted `app/` corpus still traces to a committed trial.

- [ ] **Step 4: Grade and record with the batch distinguished**

Add a `batch` column (`pilot` / `replication`) so the two runs can be queried apart and together. Do not pool them into one number without showing both.

- [ ] **Step 5: Report both, and say which one the article leads with**

The replication is the clean result and the article leads with it. The pilot is reported alongside — a second independent run agreeing is stronger evidence than either alone, and if they disagree, that disagreement is the most interesting finding in the piece and must not be buried.

Do not drop the pilot because the replication is tidier. Do not merge them to make n look bigger.

- [ ] **Step 6: Update the README's reproduce instructions and commit**

The README must describe the serial, interleaved run as the canonical mode and state that the published numbers came from it. If the opt-in concurrency flag is documented at all, document it as a convenience that is explicitly not how the results were produced.

---

### Task 14: Cross-model replication — Claude, Gemini pro, Gemini flash

Added 2026-08-02. The pilot measured **one model**: every trial ran `claude-opus-5[1m]` via `claude -p` with no `--model` flag. "Agents declare indexes" is not supported by that; "Claude Opus 5 declared indexes in 8 of 10 trials on this schema" is. This task makes it a comparison.

Supersedes Task 13's Claude-only replication — the interleaved rerun happens here, across models, so there is one clean run rather than two.

**Models, pinned explicitly. Never use an alias.** `gemini-pro-latest` exists but reports its version as the string "Gemini Pro Latest" and can move underneath a result; anything attributed to it is unreproducible.

    claude         claude-opus-5[1m]        via `claude -p`; record the resolved id from --output-format json
    gemini-pro     gemini-3.1-pro-preview   tier parity with Opus 5
    gemini-flash   gemini-3.6-flash         the 3.6 line, which exists only as flash

**There is no `gemini-3.6-pro`** — verified 2026-08-02 against the key's full model list (42 models supporting `generateContent`). So the 3.6 line cannot be compared at tier parity, and running both Gemini models is what separates model *family* from model *tier*. An Opus-5-versus-3.6-flash gap alone would confound the two.

**Design:** 3 models × 2 arms × 5 trials = **30 trials**, serial, interleaved by model and arm. Roughly 3 minutes each, so about 90 minutes.

- [ ] **Step 1: Extend the harness for models, interleaved and serial**

Build the work list as a full rotation — `claude/arm1/1, gemini-pro/arm1/1, gemini-flash/arm1/1, claude/arm2/1, …` — so model and arm both distribute across the run. Execute **one at a time**; serial is canonical, for the reasons in Task 13.

The prompt files are byte-identical across models. The prompt is the experiment's constant and must not be adapted per tool.

    claude -p "$(cat prompt-armN.txt)" --dangerously-skip-permissions
    gemini -m <model> --approval-mode yolo "$(cat prompt-armN.txt)"

**Gemini auth, verified 2026-08-02.** The CLI reads `.gemini/settings.json` from the **immediate working directory only — it does not walk up the tree.** A config at the worktree root is therefore ignored by a trial running in a subdirectory, which silently falls back to the machine's global `oauth-personal` and fails. So the harness must write

    {"security":{"auth":{"selectedType":"gemini-api-key"}}}

into `<trial-dir>/.gemini/settings.json` before each Gemini invocation. Disclose in the results that this harness-created config file is present in Gemini trial directories; it configures authentication only and is not something the model wrote.

**The API key is read from `$GEMINI_API_KEY` and is NEVER written into the script, a settings file, or any committed artifact.** The runner exits with a clear message if it is unset.

- [ ] **Step 2: Print the work list and verify the rotation before spending anything**

Confirm by eye that model and arm both alternate. A run that groups by model has reintroduced exactly the confound this task exists to remove.

- [ ] **Step 3: Run into `runs-crossmodel/`**

Leave `runs/` untouched as the pilot. A trial that fails for any reason — quota, timeout, refusal, malformed output — is **left in place with its transcript and counted as ungradeable. Never retried.** A retried trial ran under different conditions than its peers, which is the bias interleaving exists to prevent. Report ungradeable counts per model; a model that fails more often is itself a finding.

- [ ] **Step 4: Grade with model recorded**

Add `model` and `model_version` columns. Grade with the **unchanged** `grade()` and the unchanged three counts (`total_indexes`, `explicit_indexes`, `in_scope_indexes`). Do not add or adjust a metric because a model performs unexpectedly on it.

Expect lower gradeability from Gemini: the pipeline needs a Prisma project `prisma migrate diff` can read, and a session that lays its project out differently produces nothing to grade. That is a result, not a bug to work around by editing the prompt.

- [ ] **Step 5: Report per model, and state what the comparison does not support**

n per model, ungradeable per model, all three index counts, and the verdict distribution. Then the limits, in the text: one schema, one domain, one prompt, five trials per cell; and CLI harnesses differ in scaffolding, tool permissions and system prompts, so this compares **these tools as invoked here**, not the underlying models in isolation. 3.6-flash is a fast tier and 3.1-pro a frontier tier, which is why both are present.

- [ ] **Step 6: Commit, with no secret in the diff**

Grep the staged diff for the key and for any `AQ.`-prefixed string. Confirm `.gemini/` is gitignored, that no trial's `.gemini/settings.json` is staged, and that no `node_modules` is staged.
