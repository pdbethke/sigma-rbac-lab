# Results: the index-count test

**This section covers the pilot only: one model, `claude-opus-5[1m]`, n=10 gradeable
trials (5 per arm), stored in `metrics.duckdb` as `batch = 'pilot'`.** A second,
interleaved 30-trial run comparing three models — `claude-opus-4-8`,
`gemini-3.6-flash`, and Codex under ChatGPT-account auth — exists in the same database
as `batch = 'crossmodel'` and is reported separately, in "Cross-model replication
(Task 14)" below. **The two batches are never pooled** — every query in this file
filters on `batch` explicitly for exactly that reason; a query that omits the filter
mixes a different model under a different (non-interleaved) design into these numbers
and will not reproduce the table below.

**Finding, one sentence:** across 10 gradeable `claude-opus-5[1m]` pilot trials (5 per
arm, 0 ungradeable), 8 of 10 sessions declared explicit, non-unique indexes on
`InventoryDaily` and/or `InventoryAdjustment` that reason about the prompt's access
patterns without being told the word "performance," "index," or "slow" — but 2 of 10
(both arm 1) declared **zero** explicit indexes, and their transcripts never mention
indexing at all; `total_indexes` (the count previously reported as 14.0 → 18.2)
includes `CREATE UNIQUE INDEX` rows Prisma emits mechanically from `@unique`/`@@unique`
and indexes on tables outside the oracle's graded pair, and overstates the gap between
arms by roughly 3.5x once those are excluded (raw: 14.0 → 18.2; explicit-only:
7.6 → 10.0; in-scope-only: 4.0 → 5.2 — all three are reported below, not just one; n=5
per arm throughout, restated at every mean since this file was found to have a table
elsewhere reporting a mean with an ungradeable trial silently counted as a zero in the
denominator — see the Task 14 section for that correction).

## CAVEATS THAT MATTER MORE THAN ANY NUMBER BELOW

**1. Arm and time-of-run are confounded.** The runner executed all of arm 1 first
(10:47–11:02), then all of arm 2 second (11:07–11:23), sequentially — it did not
interleave trials between arms. Anything that varies across that ~40-minute window
(model routing, load, an unrelated background change) cannot be distinguished from the
arm-1-vs-arm-2 effect.

**2. Arm and Prisma major version are also confounded.** Arm 1 is 5 of 5 trials on
Prisma `^7.9.1`. Arm 2 is 3 of 5 on `^7.9.1`, plus the run's *only* two Prisma-6
trials — `arm2-trial4` on `^6.1.0` and `arm2-trial5` on `^6.19.3`. Both Prisma-6 trials
landed in arm 2, and both scored well (`arm2-trial4`: partial/partial; `arm2-trial5`:
match/partial — see the per-run table). Any difference between arm 1 and arm 2 could
be the prompt's added sentence, the run-order confound above, the Prisma-version split,
or some mix of the three — this dataset cannot separate them.

**3. A user-level `SessionStart` hook fired inside trial sessions, and the disclosure did
not mention it.** Found 2026-08-03. Hooks live in `~/.claude/settings.json`, not in
CLAUDE.md, so committing a copy of CLAUDE.md disclosed only half the environment. The hook
injects an instruction unrelated to the task — summarize the operator's calendar — and
traces of it appear in 9 of 144 committed transcripts, a few of which are false positives.
In one cross-model trial the session appended a note about it that included a personal
email address; that address has been redacted and the surrounding paragraph deliberately
left in place as the evidence the hook fired.

Assessed rather than rated away: this is **mild**. A calendar instruction carries no
information about indexing, so it cannot plausibly have moved a model toward or away from
declaring one. But nobody checked until now, and Task 17's isolation report — which was
thorough about the project's `performance` skill not leaking — did not test hooks, which
are a separate mechanism and did leak. Read that report as scoped to what it tested. Full
inventory in `hooks-at-time-of-run.md`.

At n=5 per arm the first two confounds are real limitations, not technicalities. A
follow-up task will replicate with an interleaved run order and control for (or at least
record) the Prisma version each trial resolves. Every number below should be read with all
three in mind.

## Control result — now covers every Prisma version a trial actually used

The control run (Task 2) was originally measured against Prisma 6.19.3 only. That
undercovered the data: each trial ran its own `npm install`, and only `arm2-trial5`
happened to land on 6.19.3.

| trials | Prisma installed |
| --- | --- |
| arm1-trial1 .. arm1-trial5, arm2-trial1 .. arm2-trial3 (8 trials) | `^7.9.1` |
| arm2-trial4 | `^6.1.0` |
| arm2-trial5 | `^6.19.3` |

The control was re-run against **7.9.1** and **6.1.0** as well
(`experiments/indexing/control/CONTROL.md` has the full commands and environment for
all three). `CREATE INDEX` count per version, from `parseIndexes`, not eyeballed:

| Prisma version | trials it covers | `CREATE INDEX` count |
| --- | --- | --- |
| 6.19.3 | arm2-trial5 | 0 |
| 6.1.0 | arm2-trial4 | 0 |
| 7.9.1 | the other 8 trials | 0 |

**Zero in all three.** Prisma's `migrate diff` against SQLite, for a schema declaring
relations but zero `@@index` and no `@unique` beyond primary keys, emits only
`CREATE TABLE` statements with inline `PRIMARY KEY` / `FOREIGN KEY` constraints — in
6.1.0, 6.19.3, and 7.9.1 alike. Consequence: every index a trial schema contains is
attributable to that trial's session, not to a Prisma default, for all 10 trials, not
just the one the original single-version control covered. **No subtraction was applied
to any number in this file** — there is nothing to subtract, since raw and
framework-only counts are identical (both zero) at every version in play.

## Three index counts, not one — reported side by side, per ruling

`total_indexes` (what was originally published as "average index count") counts every
`CREATE INDEX` *and* `CREATE UNIQUE INDEX` on every table in the schema. Two things
inflate it beyond what a session decided to index for an access pattern:

- **`CREATE UNIQUE INDEX` is not a choice about query performance.** Prisma emits one
  mechanically for every `@unique` / `@@unique` field — `serialNumber`, `skuNumber`,
  `storeKey`, the `(snapshotDate, storeId, productId)` grain constraint the prompt's
  own wording ("one row per snapshot date, store and product") all but dictates — none
  of that is a session reasoning about a query.
- **Most of the schema (`Store`, `Brand`, `Product`, `ProductFamily`, `ProductLine`,
  `ProductType`) is outside the oracle's graded pair** (`InventoryDaily`,
  `InventoryAdjustment`). An index there may be a real, sensible decision, but it isn't
  what this test is measuring.

So three counts are reported, computed by `countIndexes()` in `tally.ts` (tested in
`tally.test.ts` before being run against any trial) and stored in `metrics.duckdb`
alongside the verdict columns:

- **`total_indexes`** — every parsed index, unique or not, any table. (What was
  previously reported alone.)
- **`explicit_indexes`** — `total_indexes` minus every `CREATE UNIQUE INDEX`.
- **`in_scope_indexes`** — `explicit_indexes` further restricted to `InventoryDaily`
  and `InventoryAdjustment`.

Query run via `npm run duckdb -- experiments/indexing/metrics.duckdb "<sql>"` against
`experiments/indexing/metrics.duckdb`, output saved verbatim to
`experiments/indexing/summary.txt`:

**`WHERE batch = 'pilot'` is required** — `metrics.duckdb`'s `trials` table now also
holds the Task 14 cross-model run (`batch = 'crossmodel'`); omitting the filter pools a
different model under a different, non-interleaved design into these numbers and will
not reproduce the table below. Every `AVG` below is also `FILTER (WHERE gradeable)`,
so an ungradeable trial (none exist in this pilot batch, but the pattern is kept
consistent with the Task 14 section) cannot silently count as a zero in the
denominator.

```sql
SELECT arm,
       COUNT(*) FILTER (WHERE gradeable) AS n,
       COUNT(*) FILTER (WHERE NOT gradeable) AS ungradeable,
       SUM(CASE WHEN inventory_daily = 'match' THEN 1 ELSE 0 END) AS exact_match,
       SUM(CASE WHEN inventory_daily = 'partial' THEN 1 ELSE 0 END) AS partial,
       SUM(CASE WHEN inventory_daily = 'wrong-order' THEN 1 ELSE 0 END) AS wrong_order,
       SUM(CASE WHEN inventory_daily = 'missing' THEN 1 ELSE 0 END) AS missing,
       ROUND(AVG(total_indexes) FILTER (WHERE gradeable), 2) AS avg_total_indexes,
       ROUND(AVG(explicit_indexes) FILTER (WHERE gradeable), 2) AS avg_explicit_indexes,
       ROUND(AVG(in_scope_indexes) FILTER (WHERE gradeable), 2) AS avg_in_scope_indexes,
       SUM(CASE WHEN explicit_indexes = 0 THEN 1 ELSE 0 END) AS trials_with_zero_explicit
FROM trials WHERE batch = 'pilot' GROUP BY arm ORDER BY arm;
```

```
arm | n | ungradeable | exact_match | partial | wrong_order | missing | avg_total_indexes | avg_explicit_indexes | avg_in_scope_indexes | trials_with_zero_explicit
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
1 | 5 | 0 | 3 | 2 | 0 | 0 | 14 | 7.6 | 4 | 2
2 | 5 | 0 | 2 | 2 | 1 | 0 | 18.2 | 10 | 5.2 | 0
```

**n = 5 gradeable trials in arm 1, 5 gradeable trials in arm 2. Ungradeable count: 0 in
each arm (0 of 10 total).** No trial errored, timed out, or produced a schema `extractDdl`
could not read.

**The published raw gap (14.0 → 18.2, a 1.3x ratio) overstates the effect once
unique constraints and out-of-scope tables are excluded.** Explicit-only:
7.6 → 10.0 (1.32x — nearly identical ratio, smaller absolute numbers).
In-scope-only: 4.0 → 5.2 (1.3x — the same ratio again, on the two tables that
actually matter to the grading target). The *ratio* between arms is consistent across
all three metrics; what changes is that `total_indexes` makes both arms look like they
declared far more query-motivated indexing than they did, and it exaggerates the
**absolute** difference between arms in raw terms without changing the **relative** one.
Given the two confounds above (run order and Prisma version), even the consistent 1.3x
ratio should not be read as proof the added sentence caused it.

**2 of 5 arm-1 trials (`arm1-trial1`, `arm1-trial4`) declared zero explicit indexes** —
`explicit_indexes = 0` for both. All 6 of their `total_indexes` are
`CREATE UNIQUE INDEX` rows, and their sole "composite" is the
`(snapshotDate, storeId, productId)` grain constraint the prompt's wording dictates,
not an access-pattern index. 0 of 5 arm-2 trials declared zero explicit indexes.

`inventory_daily` never came back "missing" in either arm — every one of the 10 trials
declared at least one index touching `store_id` and/or `snapshot_date` on the daily
snapshot table (for `arm1-trial1`/`arm1-trial4` this is only the grain-constraint
unique index, which is why they score "partial" rather than "match" — see below).
`adjustments` (target: `store_id, product_id` on `InventoryAdjustment`) never came
back an exact "match" in either arm — see the grading note below for why.

## Per-run table

From `experiments/indexing/tally-output.md` (via `node --experimental-strip-types
experiments/indexing/tally.ts`):

| run | total | explicit | in_scope | composite | inventory_daily | adjustments |
| --- | --- | --- | --- | --- | --- | --- |
| arm1-trial1 | 6 | 0 | 0 | 1 | partial | missing |
| arm1-trial2 | 16 | 10 | 5 | 3 | match | partial |
| arm1-trial3 | 17 | 11 | 6 | 4 | match | partial |
| arm1-trial4 | 6 | 0 | 0 | 1 | partial | missing |
| arm1-trial5 | 25 | 17 | 9 | 9 | match | partial |
| arm2-trial1 | 21 | 12 | 7 | 8 | wrong-order | partial |
| arm2-trial2 | 17 | 9 | 4 | 5 | partial | partial |
| arm2-trial3 | 19 | 10 | 5 | 7 | match | partial |
| arm2-trial4 | 15 | 7 | 4 | 7 | partial | partial |
| arm2-trial5 | 19 | 12 | 6 | 9 | match | partial |

## A grading note on `adjustments`, reported rather than fixed

No trial in either arm scored an exact "match" on `adjustments` (target: an index on
`store_id, product_id`, in that order, on `InventoryAdjustment`). Per ruling: `grade()`
is not being changed in response to this — the rubric was fixed and tested (Step 1,
`tally.test.ts`, committed as `c4d534a` before any trial ran) before this data existed,
and changing it now would be exactly the thing that was forbidden. What follows is the
actual `CREATE INDEX` column list each trial declared on `InventoryAdjustment` (from
each run's `extracted.sql`, via `parseIndexes` — excluding the `serialNumber` unique
constraint, which every trial adds for a different reason and which never overlaps the
graded columns), so a reader can see exactly what "partial" covers here:

| run | `InventoryAdjustment` index column lists declared (excl. `serialNumber` unique) | verdict |
| --- | --- | --- |
| arm1-trial1 | *(none — only the `serialNumber` unique)* | missing |
| arm1-trial2 | `(storeId, productId, adjustedAt)`, `(productId)` | partial |
| arm1-trial3 | `(storeId, productId, adjustedAt)`, `(productId)` | partial |
| arm1-trial4 | *(none — only the `serialNumber` unique)* | missing |
| arm1-trial5 | `(storeId, productId, adjustedAt)`, `(productId, adjustedAt)`, `(adjustedBy)`, `(adjustedAt)` | partial |
| arm2-trial1 | `(storeId, productId, adjustedAt)`, `(productId, adjustedAt)`, `(adjusterId)` | partial |
| arm2-trial2 | `(storeId, productId, adjustedAt)`, `(productId)` | partial |
| arm2-trial3 | `(storeId, productId, adjustedAt)`, `(adjustedById)` | partial |
| arm2-trial4 | `(storeId, productId, adjustedAt)`, `(productId, adjustedAt)` | partial |
| arm2-trial5 | `(storeId, productId, adjustedAt)`, `(productId, adjustedAt)`, `(serialNumber)` | partial |

**8 of the 10 trials led their composite index with the exact target pair
`(storeId, productId)`, then added `adjustedAt` as a third, trailing column** to also
serve the "newest first" sort the prompt's page 3 asks for (arm2-trial4: *"the leading
two columns and its sort is the third, so ordering is free"*). `grade()`'s exact-key
comparison scores a 3-column index as "partial" against a 2-column target — not
because 8 of these trials failed to find the access pattern, but because the oracle's
`idx_adj_store` happens to be 2 columns and a superset does not equal a match under an
exact-key rule. **This is a limitation of "match" as defined, not of the sessions that
scored "partial."** The remaining 2 trials (`arm1-trial1`, `arm1-trial4`) are the
genuine negative case — no non-unique index touches `store_id` or `product_id` on that
table at all, which is why they score "missing" rather than "partial," and both are
also the two transcripts that never mention indexing (see below).

## A grading note on `inventory_daily`'s single "wrong-order," reported rather than fixed

`arm2-trial1` is the only trial scored "wrong-order" on `inventory_daily`, and reading
it as "arm 2 degrading" is not supported by what the trial actually declared. Its
`InventoryDaily` indexes (from `extracted.sql`, excluding the unique grain constraint)
are:

```
CREATE INDEX ... ON "InventoryDaily"("snapshotDate", "storeId")
CREATE INDEX ... ON "InventoryDaily"("storeId", "snapshotDate", "isLowStock")
CREATE INDEX ... ON "InventoryDaily"("productId", "snapshotDate")
CREATE INDEX ... ON "InventoryDaily"("merchantId")
```

The target is `(store_id, snapshot_date)`. The trial declares that exact pair **as the
leading two columns of a three-column index** (`storeId, snapshotDate, isLowStock`) —
which serves the target access pattern at least as well as a bare 2-column index
would. `grade()`'s exact-key comparison does not look inside longer indexes for a
matching prefix; it only compares whole-index column lists. Because the *reversed*
2-column pair (`snapshotDate, storeId`) exists as its own separate index, the exact-key
rule finds that reversed key before it would ever consider a prefix match, and returns
"wrong-order." **This is the same class of problem as the `adjustments` superset
issue above, on the other graded table: the rubric's exact-key rule cannot express
"the target columns are present and leading inside a longer index," so a trial that
declared a *superset* of the target — in the correct order, even — can still be
scored as if it got the order wrong.** `grade()` is unchanged in response to this, per
the same ruling as `adjustments`.

Two other trials (`arm2-trial2`, `arm2-trial4`) show a milder version of the same
pattern — target-prefix-inside-a-longer-index, no exact 2-column match either way — and
score "partial" rather than "match," for the same structural reason.

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
to produce runnable output. The Prisma-6-vs-7 split (8 vs 2) happened without being
prompted either way — but it is not mere trivia: it lands entirely inside arm 2 (see
"Caveats" above) and is a named confound, not a footnote.

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
schemas to the rest but never surfaced index reasoning, and both are the only two
trials in the whole run with `explicit_indexes = 0` — every one of their 6 counted
`total_indexes` is a `CREATE UNIQUE INDEX` Prisma derived from `@unique`, not a query
index the session chose to add.

## Reproduce

```bash
TRIALS=5 ./experiments/indexing/runTrials.sh
node --experimental-strip-types experiments/indexing/tally.ts
npm run duckdb -- experiments/indexing/metrics.duckdb "
  SELECT arm,
         COUNT(*) FILTER (WHERE gradeable) AS n,
         COUNT(*) FILTER (WHERE NOT gradeable) AS ungradeable,
         ROUND(AVG(total_indexes) FILTER (WHERE gradeable), 2) AS avg_total_indexes,
         ROUND(AVG(explicit_indexes) FILTER (WHERE gradeable), 2) AS avg_explicit_indexes,
         ROUND(AVG(in_scope_indexes) FILTER (WHERE gradeable), 2) AS avg_in_scope_indexes
  FROM trials WHERE batch = 'pilot' GROUP BY arm ORDER BY arm;
"
```

`WHERE batch = 'pilot'` is required for the reason stated above — `tally.ts`'s own
`recordMetrics()` only ever writes `batch = 'pilot'` rows when re-run against a fresh
`trials` table (it does not know about `batch = 'crossmodel'`), but this file's copy of
the query must filter explicitly since it runs against the *shared* `metrics.duckdb`
that also holds the Task 14 data.

## Cross-model replication (Task 14) — Claude, Gemini, Codex

**A second, separate, interleaved run** compares three models on the identical prompt
pair used above: `claude-opus-4-8`, `gemini-3.6-flash`, and Codex under a
ChatGPT-account entitlement. 30 trials (3 models x 2 arms x 5 trials), stored in the
same `metrics.duckdb` `trials` table as `batch = 'crossmodel'` — **never pooled with
the pilot's 10 `batch = 'pilot'` rows above**, both because it is a different model
and because this run is genuinely interleaved (claude/arm1/1, gemini/arm1/1,
codex/arm1/1, claude/arm2/1, ...) while the pilot ran all of arm 1 before all of arm 2.
`grade()`, `countIndexes()`, `extractDdl()`, and `parseIndexes()` are byte-identical to
the pilot's; prompts are byte-identical across all three models.

**Tier caveat, stated once here and not repeated as a hedge below:** `claude-opus-4-8`
and Codex's underlying model (self-reported "GPT-5" inside its own transcript — **not
independently verified**, and this project does not treat a model's self-report as
evidence; see the provenance note below) are frontier-tier; `gemini-3.6-flash` is a
fast tier. Any gap involving Gemini in this section confounds model family with model
tier and cannot support a claim of the form "Claude/Codex is better than Gemini."

**Codex provenance, stated once here and not repeated as a hedge below:** recorded in
`metrics.duckdb`'s `model_version` column as exactly `codex-cli 0.142.5 default under
ChatGPT-account auth; underlying model self-reported as GPT-5, not independently
verified` — never a bare "GPT-5." No `-m`/model flag was passed to Codex; this
machine's ChatGPT-account entitlement rejects every explicit model id with a 400, so
only the CLI's default is exercised here.

### n, gradeable, ungradeable

| model | n attempted | n gradeable | ungradeable | reason |
| --- | --- | --- | --- | --- |
| `claude-opus-4-8` | 10 | 9 | 1 | `arm2-trial4`: CLI exited 0, but the session proposed a design and asked a clarifying question instead of writing any files — no `prisma/schema.prisma` anywhere in the trial directory. Not a crash; a real failure mode of a one-shot, non-interactive invocation with no second turn to answer on. |
| `gemini-3.6-flash` | 10 | 10 | 0 | — |
| Codex | 10 | 10 | 0 | — |

### Index counts — every mean stated beside its n

**Every mean below is computed only over that row's gradeable trials
(`AVG(...) FILTER (WHERE gradeable)`), never over all 5 attempted.** This matters
concretely for `claude-opus-4-8` arm 2, n=4 (not 5): the naive query
`AVG(explicit_indexes)` with no gradeable filter silently counts the one ungradeable
trial's stored `0` as a real data point in a denominator of 5 and returns **7.2**
explicit / **3.2** in-scope — both wrong. The correct, gradeable-only figures are
**9.0** explicit / **4.0** in-scope, n=4.

| model | arm | n gradeable | avg total_indexes | avg explicit_indexes | avg in_scope_indexes |
| --- | --- | --- | --- | --- | --- |
| `claude-opus-4-8` | 1 | 5 | 15.8 | 10.4 | 5.0 |
| `claude-opus-4-8` | 2 | **4** | 13.25 | **9.0** | **4.0** |
| `gemini-3.6-flash` | 1 | 5 | 3.2 | 0.0 | 0.0 |
| `gemini-3.6-flash` | 2 | 5 | 13.8 | 10.4 | 5.4 |
| Codex | 1 | 5 | 11.8 | 6.2 | 3.6 |
| Codex | 2 | 5 | 16.0 | 11.0 | 5.8 |

**`claude-opus-4-8`'s arm effect is reversed from every other model in this file**
(arm 1 higher than arm 2: 10.4 → 9.0 explicit, 5.0 → 4.0 in-scope) — opposite of the
pilot's `claude-opus-5[1m]` (7.6 → 10.0) and of both `gemini-3.6-flash` (0.0 → 10.4) and
Codex (6.2 → 11.0) in this same run. **This is explicitly not a finding at n=4-5 per
arm** — it is as consistent with one trial's placement as with any real effect, and is
reported here only so it isn't mistaken for silence rather than a checked, reversed
result.

**`gemini-3.6-flash` is 5 of 5 zero-explicit in arm 1 and 5 of 5 non-zero (9-12
explicit) in arm 2** — the starkest split in either run, and because this run is
genuinely interleaved, it is not subject to the pilot's time-of-run confound. Still
n=5 per arm, one schema, one prompt: a strong correlational signal in this one run, not
proof the "production scale" sentence causes the behavior.

**Codex's arm-1 mean (6.2) is not a clean shift — it rests on 2 of 5 near-zero
trials.** Codex arm-1 `explicit_indexes` by trial order: 3, 3, 7, 9, 9. Two trials
declared almost nothing (3 each, both scoring `partial`/`missing` or worse on the
graded tables) while the other three were comparable to arm 2. Reporting only the mean
(6.2) obscures that this is a bimodal split within arm 1, not five trials clustered
near the average.

### Reasoning visibility — an observation about the CLIs' transcripts, not the models

**Claude's CLI surfaced index reasoning in prose in every gradeable trial** (0 of 9
gradeable trials had `explicit_indexes = 0`) — an observation about what
`claude`'s `-p` transcript output shows, not a comparative claim about what the
underlying models "considered." Codex declared comparable index *counts* to Claude in
many trials, but its transcripts (~60x larger, ~154 KB vs. ~2.5 KB average) carry
almost no visible natural-language justification for column choices — this may be a
logging/verbosity difference between the CLIs rather than a difference in what Codex's
underlying model reasoned through, and is reported as a transcript-visibility fact, not
as "Claude reasoned better than Codex."

### What this section supports and does not

Same limits as the pilot, plus: this measures **these three CLI tools as invoked
here** — one prompt each, no retries, the exact flags in the Task 14 brief — not the
three models in isolation, since scaffolding, tool permissions, verbosity, and even
whether the CLI runs `npm install` at all (Codex never did; Claude and Gemini always
did) differ by tool. No causal claim about the "production scale" sentence is
supported for any model at n=5/cell, even under this interleaved design. Full detail,
every per-trial row, and verbatim transcript quotes are in the Task 14 workspace
report (not committed to this repo — see that report for the file path).
