# Task 15 report — the drift experiment

Pre-registration: `experiments/drift/EXPECTED.md`, committed `63cdf40` at 15:27:03,
before the first session started at 15:28:58. Not revised after seeing data.

Model: `claude-opus-4-8`, both arms. Baseline: fresh copies of
`experiments/indexing/runs-crossmodel/claude/arm1-trial5` (explicit 10, in-scope 5,
`inventory_daily` verdict `match`), one per trial, never mutated. 3 trials per arm,
run serially, interleaved by increment then by trial×arm (never all of one arm
first). All 24 sessions completed, `rc=0` on every one.

## 1. Outcome table (increment × arm × trial)

| Increment | class | expected index | armA-t1 | armA-t2 | armA-t3 | armB-t1 | armB-t2 | armB-t3 |
|---|---|---|---|---|---|---|---|---|
| 1 — largest adjustments this month | A | `(adjustedAt)` | correct | correct | correct | correct | correct | correct |
| 2 — adjustments by user, date range | B | `(adjustedBy, adjustedAt)` | correct | correct | correct | correct | correct | correct |
| 3 — store stockout count by date | A | `(snapshotDate, isStockout)` | correct | correct | partial | partial | partial | correct |
| 4 — product cost history across stores | B | `(productId, snapshotDate)` | correct | correct | correct | correct | correct | correct |

Raw counts, n=3 per arm:
- Increment 1: correct 3/3 (A), 3/3 (B). none/flagged 0/3 both arms.
- Increment 2: correct 3/3 (A), 3/3 (B).
- Increment 3: correct 2/3 (A), 1/3 (B); partial 1/3 (A), 2/3 (B).
- Increment 4: correct 3/3 (A), 3/3 (B).

Every one of 24 increments is gradeable; nothing excluded from the counts above.

## 2. Arm A vs arm B

**Indistinguishable.** Both arms declared an index at every single increment (24/24),
with no `none` and no `flagged` outcome anywhere. The only misses (3 of 24, `partial`)
are split 1 in arm A (trial 3) and 2 in arm B (trials 1, 2) — a difference of one
trial on n=3 per arm, not a pattern. Both arms' partials made the *identical* choice:
`@@index([isStockout])` alone, explicitly reasoned by analogy to the neighboring
`@@index([isLowStock])`, rather than the composite the actual query (`where:
{ snapshotDate, isStockout: true }`) demands. That is a shared reasoning shortcut, not
a context-loss effect — arm B's fresh sessions did not degrade relative to arm A's
continuous one. Lost context across sessions is not the mechanism behind this miss.

## 3. `flagged` instances, verbatim

None. No increment in either arm declared nothing while raising the index question in
prose — every increment declared an index outright (correct or partial), so the
`flagged` category has zero occurrences in this run.

## 4. N+1 introduced into previously-clean code

None found. The scanner (`.claude/skills/performance/scanNPlusOne.ts`) reported
`query-in-loop` zero times across all 120 increment scans (24 increments × 5
snapshots each, 0–4). `unincluded-relation` candidates grew monotonically (0, 1, 1, 2,
3) identically across every trial in both arms, and by-hand inspection of every
distinct line found the same shape each time: a Prisma `groupBy()` aggregate field
(`_sum`, `_avg`, `_count`) read inside `.map()` over the grouped result — the exact
false-positive class already documented in Task 14's `SCAN-RESULTS.md`. No genuine
N+1 appears anywhere, and none appears in code that was clean at a prior increment.

## 5. Class A vs class B

No contrast. Class A (increments 1, 3 — features that imply a pattern without naming
it) and class B (increments 2, 4 — a query no existing index serves, with the demand
explicit in the access pattern though never in performance vocabulary) produced the
same outcome distribution: correct except for the identical `isStockout` shortcut in
increment 3, which is class A. The model revisited the index set on the *quiet*
increments (1, 3) exactly as reliably as on the *loud* ones (2, 4). If anything, the
one miss occurred on a class A increment, which is the opposite of what "reacts to
obvious demand, not gradual drift" would predict.

## 6. Verdict on the hypothesis

**"It indexes on the foundational creation, but not in the expansion" — falsified in
this run.** Task 14 found this model averaged 10.4 explicit indexes at creation
(arm 1) with every gradeable trial declaring some. Task 15 finds the same model
declared a new, schema-appropriate index at 24 of 24 expansion increments across two
session-continuity conditions and two increment classes, missing only the exact
composite column order on 3 of 24 (all the same near-miss, all still declaring an
index). Nothing here shows the index set going unrevisited as increments accumulate,
and arm B (fresh session, no memory) did not underperform arm A (continuous session).
This is a real result, not an artifact of a rules change — grading rules were fixed
before the run and not touched afterward.

## Concerns / limits

- **One domain, one baseline project, one model.** This says nothing about weaker
  models, unfamiliar schemas, or longer accumulation than four increments.
- **Baseline was already well-indexed** (10 explicit, 5 in-scope per Task 14). It is
  plausible the model pattern-matches "this schema gets an index for every new access
  pattern" from the surrounding code rather than reasoning fresh each time — the
  existing `@@index([isLowStock])` visibly primed the `isStockout` guess (both
  correct and partial cases cite it explicitly). That is a real, specific mechanism,
  but it is imitation-of-neighboring-code, not context loss, and it is exactly why
  the increment-3 misses look identical across arms rather than degrading with lost
  memory.
- **`EXPECTED.md` in hindsight:** increment 3's expected `(snapshotDate, isStockout)`
  is defensible but not the only defensible answer — a single-column `(isStockout)`
  index paired with the existing `(snapshotDate)` index is a real (if less optimal)
  serving path for the same query. Grading it `partial` rather than `correct` is
  consistent with the pre-registered column-order requirement, but a reader should
  know the miss is smaller than "ignored the query" — it is "chose the less specific
  composite," in every case reasoning explicitly and correctly about *why* an index
  was needed at all.
- **Four increments is a short accumulation window.** The brief's own step 6 caveat
  applies: this does not rule out drift appearing at increment 8 or 20, or under a
  compacted (not fresh) session — arm B here is the harsher case only relative to arm
  A, not relative to a real compaction event.
- **All 24 sessions exited 0** — no idempotency or failure-recovery path was
  exercised; the runner's failure-handling logic is untested by this run.
