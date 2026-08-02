# N+1 scan: all ten trials plus the promoted app

Scanner: `.claude/skills/performance/scanNPlusOne.ts`, run via
`node --experimental-strip-types`. Two rules — `query-in-loop` and
`unincluded-relation` — 11 passing unit tests (see Task 6 report for the
scanner's own construction and its disclosed blind spots, reproduced below).

## What was scanned, and how

```
for d in experiments/indexing/runs/*/; do
  node --experimental-strip-types .claude/skills/performance/scanNPlusOne.ts "$d/src"
done
node --experimental-strip-types .claude/skills/performance/scanNPlusOne.ts app
```

All ten trials under `experiments/indexing/runs/` laid their query code out
under `src/` (checked with `find "$d" -maxdepth 3 -type d` before scanning —
no trial needed a different subdirectory). Every trial was therefore
scanned; none is reported as NOT SCANNED.

`scanPath` hard-codes a skip set — `node_modules`, `.git`, `migrations`,
`dist`, `runs` (source: `.claude/skills/performance/scanNPlusOne.ts:235`).
Every trial directory has an installed `node_modules/`; confirmed the scan
did not wander into it — the output above lists only `.ts` files under each
trial's own `src/`, and a manual `grep node_modules` over `scan-output.txt`
returns nothing.

## Per-trial summary

| trial | files under src/ | candidates | true positive | false positive |
|---|---|---|---|---|
| arm1-trial1 | queries.ts | 1 | 0 | 1 |
| arm1-trial2 | queries.ts, seed.ts, client.ts, smoke.ts | 1 | 0 | 1 |
| arm1-trial3 | queries.ts, seed.ts, client.ts, smoke.ts | 4 | 3 | 1 |
| arm1-trial4 | queries.ts | 1 | 0 | 1 |
| arm1-trial5 | queries.ts, client.ts | 1 | 0 | 1 |
| arm2-trial1 | queries.ts, client.ts, smoke.ts | 0 | 0 | 0 |
| arm2-trial2 | queries.ts, seed.ts, client.ts, smoke.ts | 6 | 6 | 0 |
| arm2-trial3 | queries.ts, seed.ts, verify.ts | 5 | 4 | 1 |
| arm2-trial4 | queries.ts | 0 | 0 | 0 |
| arm2-trial5 | queries.ts | 0 | 0 | 0 |
| **app** (promoted, arm1-trial2 source) | queries.ts, client.ts, seed.ts, smoke.ts | 1 | 0 | 1 |

**Totals: 20 candidates, 13 true positives, 7 false positives** (35% false-positive
rate on this corpus).

Every one of the 7 false positives, in every trial that produced one
(including `app`), is the *same* misclassification (see below). Every one of
the 13 true positives is in a seed/setup script, never in the four
request-serving `queries.ts` functions the article is actually about — in
`queries.ts`, the scanner found **zero real N+1 patterns** across all ten
trials and the promoted app.

## Raw output

See `experiments/indexing/scan-output.txt` for the full run (identical to
what's summarized above).

## Judging every candidate

### The false-positive class: `groupBy()` aggregate fields read as a "relation"

All 7 `unincluded-relation` findings are the identical shape, e.g.
`arm1-trial2/src/queries.ts:140` and (same code) `app/src/queries.ts:140`:

```ts
const totals = await prisma.inventoryDaily.groupBy({
  by: ["storeId"],
  where: { storeId: { in: stores.map((s) => s.id) }, snapshotDate },
  _sum: { inventoryValue: true },
});

const byStoreId = new Map(
  totals.map((t) => [t.storeId, t._sum.inventoryValue ?? 0]),
);
```

The flagged access is `t._sum.inventoryValue` inside `.map()` over `totals`.
`unincludedResults()` treats any `findMany`/`groupBy`/etc. call with no
`include`/`select` as producing an "unincluded" result, and
`callbackBinding()` correctly binds `t` to that result's element. The rule
then sees a depth-2 member chain (`t._sum.inventoryValue`) rooted at `t` and
flags it as a relation walk.

But `_sum` is not a relation — it's Prisma's own aggregate wrapper object,
returned inline in the same query result, one row per group. Reading
`t._sum.inventoryValue` issues zero additional queries; there is nothing to
batch or `include`. The rule has no concept of aggregate-shaped fields
(`_sum`, `_avg`, `_count`, `_min`, `_max`) versus true relation objects — it
only checks chain depth and whether the root was an "unincluded" query
result. This is a real, fully diagnosed false-positive class, not a maybe:
verified by reading each of the 7 sites (`arm1-trial1:123`, `arm1-trial2:140`,
`arm1-trial3:134`, `arm1-trial4:121`, `arm1-trial5:141`, `arm2-trial3:280`,
`app/src/queries.ts:140`) — all seven are `.map()` callbacks over a
`groupBy()` result reading `._sum.<field>`, nothing else.

This also confirms the two independent human reads recorded in the Task 5
report: `app/src/queries.ts` has no N+1 pattern, and the scanner's one hit
against it is exactly this false positive, not a missed bug.

### The true-positive class: `.create()` literally inside a loop, in `seed.ts`

All 13 `query-in-loop` findings are in seed/setup scripts
(`arm1-trial3/src/seed.ts`, `arm2-trial2/src/seed.ts`,
`arm2-trial3/src/seed.ts`), never in `queries.ts`. Each is a genuine,
structurally correct match: a Prisma `.create()` call sitting directly
inside a `for`/`.map()` body, so each iteration issues its own INSERT.
These are real per-the-rule's-definition — the code does issue N separate
round trips where `createMany` (which some of these same files use
elsewhere, e.g. `arm2-trial2/src/seed.ts:136` for the big `InventoryDaily`
batch) would do it in one. They are not, however, the kind of finding the
article's N+1 section is chasing: seed scripts run once at setup time, not
per user request, so the "N+1 on a page load" story doesn't apply to them
even though the rule correctly fires.

**Most illustrative real finding**, with a verifiable multiplier:
`arm1-trial3/src/seed.ts:87`:

```ts
let counter = 0;
for (const snapshotDate of [DAY_1, DAY_2]) {
  for (const store of stores) {
    for (const product of products) {
      counter += 1;
      // ...
      await prisma.inventoryDaily.create({
        data: {
          snapshotDate,
          storeId: store.id,
          productId: product.id,
          // ...
        },
      });
    }
  }
}
```

2 snapshot dates × 3 stores × 2 products = 12 iterations, 12 separate
`INSERT` round trips. Querying the trial's own seeded database confirms the
multiplier exactly:

```
$ python3 -c "... select count(*) from InventoryDaily ..."
Store         3
Product       2
InventoryDaily 12
```

12 = 2 × 3 × 2, matching the loop bounds precisely. A single `createMany`
call (as the same file's sibling stores/products arrays are batched via
`Promise.all(...)`, and as `arm2-trial2/src/seed.ts:136` does for its own
1,920-row `InventoryDaily` insert) would collapse this to one round trip.

The other seed-script findings follow the same shape at smaller or larger
scale — e.g. `arm2-trial2/src/seed.ts:88` (`prisma.product.create()` inside
a nested `for`, 16 iterations, matching that trial's `Product` count of 16
exactly) and `arm2-trial2/src/seed.ts:45` (`prisma.store.create()`, 4
iterations, matching `Store` count of 4).

## The honest conclusion

**Zero real N+1 patterns were found in any trial's `queries.ts` — the actual
page-serving code the article is about — across all ten independently
generated trials and the promoted app.** This matches, and is now backed by
a second, independent form of evidence for, the two human reads recorded in
the Task 5 report: every trial's four page-query functions use nested
`select`/`include` inside a single `findMany`/`groupBy` call, `Promise.all`
for genuinely independent scalar lookups, and in-memory `Map` joins against
already-fetched rows. That is the N+1-avoiding shape by construction, not by
luck, and ten independent generations converging on it is a stronger claim
than one.

**"The scanner found nothing" and "there is nothing to find" are different
claims, and this project can only make the first one with full honesty if
the scanner's own blind spots are named.** Carried forward from the Task 6
report, unchanged and still accurate — none of these patterns appear in any
trial's `queries.ts`, but the scanner cannot see them either, so their
absence is not scanner-verified:

- Destructured query-result bindings (`const { items } = await prisma...`).
- Aliasing via reassignment before iterating.
- Query results returned from or threaded through another function
  (no interprocedural analysis — the scanner is purely syntactic, one file
  at a time).
- Wrapper/repository methods not literally named a known Prisma method
  (`.list()`, `.getAll()`, etc).
- C-style `for` loops indexing an array (`items[i].product.brand`) —
  deliberately excluded to avoid a worse false-positive class.
- `reduce`'s element (second) callback parameter — deliberately unbound,
  see Task 6 report.
- Destructured callback parameters (`items.forEach(({ product }) => ...)`).
- Chained or non-identifier receivers (`getItems().forEach(...)`,
  `store.items.forEach(...)`).
- Raw/uncommon query methods outside `QUERY_METHODS`
  (`$queryRaw`, `findRaw`, `aggregateRaw`, etc).

A human read of two of the ten trials' `queries.ts` files
(`arm1-trial2`/`app` and `arm1-trial3`, done in the course of judging the
false positives above) turned up no instance of any of these blind-spot
shapes either — no destructuring of query results, no wrapper repositories,
no C-style loops, no `reduce` over query results, no chained receivers. So
for the two trials read closely, a human reviewer agrees with the scanner's
"nothing here," and none of the disclosed blind spots would have hidden a
missed N+1 in those two files specifically. That is a narrower claim than
"none of the ten trials have any N+1 the scanner could have missed" — the
other eight trials' `queries.ts` files were scanned but not separately
hand-read line by line for blind-spot shapes, only judged where the scanner
produced a candidate.

**Net for the article:** ten independent trials, one promoted app, twenty
scanner candidates, thirteen true positives (all in one-time seed scripts,
none in page-serving code), seven false positives (one diagnosed
misclassification: `groupBy()` aggregate fields read as relations). Zero
N+1 patterns in any trial's actual query code. The scanner is a credible,
imperfect candidate-finder with a named 35% false-positive rate on this
corpus and a disclosed, non-trivial false-negative list — not a proof
engine, and the corpus's cleanliness is a finding about how these ten
sessions wrote query code, not a claim that no N+1 pattern could possibly
exist anywhere in it.
