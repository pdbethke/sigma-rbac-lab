# Results: the index-count test

**Finding, one sentence:** across 10 gradeable trials (5 per arm, 0 ungradeable), every
session declared composite indexes and reasoned about access patterns on
`InventoryDaily` and `InventoryAdjustment` without being told the word "performance,"
"index," or "slow" — arm 2's one added sentence about production scale increased the
average index count (14.0 → 18.2) and pushed `inventory_daily` scoring from three
exact matches / two partial to two exact matches / two partial / one wrong-order, but
did not change whether an index existed at all; this is a boring result and it is
reported as one.

## CAVEAT THAT MATTERS MORE THAN ANY NUMBER BELOW

**The runner executed all of arm 1 first (10:47–11:02), then all of arm 2 second
(11:07–11:23), sequentially — it did not interleave trials between arms.** Arm is
therefore confounded with time-of-run: anything that varies across that ~40-minute
window (model routing, load, an unrelated background change) cannot be distinguished
from the arm-1-vs-arm-2 effect. At n=5 per arm this is a real limitation, not a
technicality — a follow-up task will replicate with an interleaved run order before any
arm-vs-arm claim is treated as solid. Every number below should be read with this in
mind.

## Control result (Task 2, unchanged, nothing subtracted)

`experiments/indexing/control/CONTROL.md`: Prisma 6.19.3's `migrate diff` against SQLite,
for a schema declaring relations but zero `@@index` and no `@unique` beyond primary
keys, emits **zero** `CREATE INDEX` statements. Only `CREATE TABLE` with inline
`PRIMARY KEY` / `FOREIGN KEY` constraints. Consequence: every index a trial schema
contains is attributable to that trial's session, not to a Prisma default. No
subtraction was applied to any number in this file.

## Per-arm summary (from a query, not counted by hand)

Query run via `npm run duckdb -- experiments/indexing/metrics.duckdb "<sql>"` against
`experiments/indexing/metrics.duckdb`, output saved verbatim to
`experiments/indexing/summary.txt`:

```sql
SELECT arm,
       COUNT(*) FILTER (WHERE gradeable) AS n,
       COUNT(*) FILTER (WHERE NOT gradeable) AS ungradeable,
       SUM(CASE WHEN inventory_daily = 'match' THEN 1 ELSE 0 END) AS exact_match,
       SUM(CASE WHEN inventory_daily = 'partial' THEN 1 ELSE 0 END) AS partial,
       SUM(CASE WHEN inventory_daily = 'wrong-order' THEN 1 ELSE 0 END) AS wrong_order,
       SUM(CASE WHEN inventory_daily = 'missing' THEN 1 ELSE 0 END) AS missing,
       ROUND(AVG(total_indexes), 2) AS avg_indexes
FROM trials GROUP BY arm ORDER BY arm;
```

```
arm | n | ungradeable | exact_match | partial | wrong_order | missing | avg_indexes
--- | --- | --- | --- | --- | --- | --- | ---
1 | 5 | 0 | 3 | 2 | 0 | 0 | 14
2 | 5 | 0 | 2 | 2 | 1 | 0 | 18.2
```

**n = 5 gradeable trials in arm 1, 5 gradeable trials in arm 2. Ungradeable count: 0 in
each arm (0 of 10 total).** No trial errored, timed out, or produced a schema `extractDdl`
could not read.

`inventory_daily` never came back "missing" in either arm — every one of the 10 trials
declared at least one index touching `store_id` and/or `snapshot_date` on the daily
snapshot table. `adjustments` (target: `store_id, product_id` on
`InventoryAdjustment`) never came back an exact "match" in either arm — see the
grading note below for why.

## Per-run table

From `experiments/indexing/tally-output.md`:

| run | total | composite | inventory_daily | adjustments |
| --- | --- | --- | --- | --- |
| arm1-trial1 | 6 | 1 | partial | missing |
| arm1-trial2 | 16 | 3 | match | partial |
| arm1-trial3 | 17 | 4 | match | partial |
| arm1-trial4 | 6 | 1 | partial | missing |
| arm1-trial5 | 25 | 9 | match | partial |
| arm2-trial1 | 21 | 8 | wrong-order | partial |
| arm2-trial2 | 17 | 5 | partial | partial |
| arm2-trial3 | 19 | 7 | match | partial |
| arm2-trial4 | 15 | 7 | partial | partial |
| arm2-trial5 | 19 | 9 | match | partial |

## A grading note on `adjustments`, reported rather than fixed

No trial in either arm scored an exact "match" on `adjustments`. This is not because
sessions ignored the access pattern — several sessions built a composite index on
`InventoryAdjustment` covering exactly `store_id, product_id`, but then added
`adjusted_at` as a trailing third column to also serve the "newest first" sort (arm2
trial4: *"`@@index([storeId, productId, adjustedAt])` on adjustments — query 3's filter
is the leading two columns and its sort is the third, so ordering is free."*).
`grade()`'s exact-key comparison scores that as "partial" (some but not all target
columns present) rather than "match," because the oracle's `idx_adj_store` is a
2-column index and the trial's is 3 columns. That is a real property of a grading rule
fixed before any trial ran (see Task brief Step 1 / this file's test suite,
`tally.test.ts`, committed before `runTrials.sh` was invoked) — it is reported here as
a limitation of "match" as defined, not adjusted after the fact. `grade()` was not
touched after seeing this data.

## Tooling deviations found and fixed (infrastructure, not grading)

1. **`@duckdb/node-api` (1.5.5-r.3):** the brief's sketch for `recordMetrics` and
   `duckdbQuery.ts` — `DuckDBInstance.create(path)`, `.connect()`,
   `connection.run(sql, params)`, `connection.runAndReadAll(sql)`,
   `reader.getRowObjects()` — was verified against
   `node_modules/@duckdb/node-api/lib/DuckDBInstance.d.ts`,
   `DuckDBConnection.d.ts`, and `DuckDBResultReader.d.ts` before use. **No deviation
   was needed** — every call in the brief exists with the signature assumed, including
   positional `$1..$n` parameter binding via an array. The package's top-level export
   list is dominated by type constants (`ANY`, `ARRAY`, `BIGINT`, ...), which is why a
   prior agent's surface scan looked unpromising; the connection API lives in
   `DuckDBInstance`/`DuckDBConnection`, reached via `import { DuckDBInstance } from
   "@duckdb/node-api"`.
2. **TypeScript execution:** `node --experimental-strip-types` ran `tally.ts` and
   `duckdbQuery.ts` directly with no errors on Node v22.23.2. `npx tsx` was not needed.
   Task 7's hook command should use `node --experimental-strip-types`.
3. **`extractDdl()` — two real bugs in the brief's sketch, found by every trial coming
   back "ungradeable" on the first tally run:**
   - The sketch's `execFileSync` call had no `cwd`, so `npx prisma` resolved this
     repo's own root `devDependency` (Prisma 6.19.3) instead of each trial's locally
     installed Prisma, and the schema path was interpreted relative to the repo root
     instead of the trial directory. Several trials also moved their datasource config
     into a `prisma.config.ts`, which Prisma only discovers relative to the current
     working directory. Fixed by running with `cwd: projectDir` and a schema path
     relative to that `cwd`.
   - 8 of the 10 trial projects installed Prisma **7.9.1** (whatever `npm install`
     resolved as latest at run time); Prisma 7 renamed `migrate diff`'s
     `--to-schema-datamodel` flag to `--to-schema` (the old flag now errors: "was
     removed. Please use --[from/to]-schema instead"). The other 2 trials
     (`arm2-trial4`, `arm2-trial5`) pinned Prisma 6.19.3, matching the control run, and
     only accept the old flag name. `extractDdl()` now tries `--to-schema` first, then
     falls back to `--to-schema-datamodel`, so a trial's own Prisma version does not
     itself decide gradeability.
   - This fix was made to the DDL-extraction plumbing, not to `grade()`'s scoring
     rules — the `Verdict` logic in `tally.ts` is byte-for-byte what Step 1's tests
     were written and passed against, before any trial ran.

That every trial installed a real Prisma version and produced a schema Prisma's own
CLI could diff is itself worth noting for the article: none of the ten sessions failed
to produce runnable output, and the Prisma-6-vs-7 split (8 vs 2) happened without being
prompted either way.

## Verbatim transcript quotes on indexing choices

**arm1-trial2** (no "production" sentence), explaining a deliberate choice not to
index every foreign key:

> "Indexes follow the four access paths rather than blanket-covering every foreign
> key. `InventoryDaily(storeId, snapshotDate)` serves pages 1 and 2,
> `InventoryDaily(snapshotDate)` serves page 4's cross-store sweep, and
> `InventoryAdjustment(storeId, productId, adjustedAt)` covers page 3's filter and its
> newest-first sort in a single pass."

**arm1-trial5** (no "production" sentence), naming all five indexes and the query each
serves, unprompted:

> "Indexes follow the four access paths: `[storeId, snapshotDate]`,
> `[productId, snapshotDate]`, `[storeId, isLowStock]` on the daily table,
> `Store.region`, and `[storeId, productId, adjustedAt]` on adjustments."

**arm2-trial2** (with the "production scale" sentence), justifying column order and
naming a cost tradeoff:

> "Three indexes, each justified. The `(snapshotDate, storeId, productId)` unique
> defines the grain *and* serves page 4 from its leading pair. `(storeId, snapshotDate,
> isLowStock)` serves pages 1 and 2 — the flag is the third column so low-stock
> filtering happens inside the index rather than by fetching and discarding healthy
> rows. `productId` alone exists only for FK maintenance, which would otherwise
> full-scan the biggest table on a product delete. Indexes cost write throughput on the
> nightly load, so there are no speculative extras."

**arm2-trial1** (with the "production scale" sentence), on why a lookup table gets an
index the schema alone wouldn't suggest:

> "`Store(region)` is indexed because queries 2 and 4 both start by resolving a region
> to store ids — that keeps the fact-table read an indexed `IN (...)` instead of a
> join-then-filter... FKs are indexed explicitly since SQLite won't."

**arm1-trial1 and arm1-trial4** (no "production" sentence; both scored "partial" on
`inventory_daily` and "missing" on `adjustments`) — both sessions wrote transcripts of
comparable length and detail to the other eight, but **neither one mentions indexing at
all.** Both explain the Prisma-7 driver-adapter workaround, the `@@unique` grain
constraint, and a query-scoping judgment call, and then stop — no sentence anywhere in
either transcript names an index, a query plan, or a performance consideration. This is
the cleanest contrast in the data: two sessions that produced structurally similar
schemas to the rest but never surfaced index reasoning, and both are the two lowest
`total_indexes` counts in the whole run (6 and 6, versus a 10-trial range of 6–25).

## Reproduce

```bash
TRIALS=5 ./experiments/indexing/runTrials.sh
node --experimental-strip-types experiments/indexing/tally.ts
npm run duckdb -- experiments/indexing/metrics.duckdb "<query above>"
```
