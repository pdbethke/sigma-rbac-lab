# Task 19 — can one instruction beat convention?

Run 2026-08-03. Graded against `../drift/EXPECTED.md`, which was committed at 63cdf40 on
2026-08-02 15:27:03, before any session in this line of work existed. The rubric was not
touched after seeing this data.

## The manipulation

The Task 18 stripped baseline plus **one file**, `CLAUDE.md`, containing exactly:

> When you add or change a query, declare the database index that serves its access
> pattern, or state explicitly why no new index is needed.

Verified before the run: that file is the only difference from the Task 18 baseline, the
prompts are byte-identical to `../drift/prompts/`, and the stripped schema declares zero
`@@index`.

Same harness, same model (`claude-opus-4-8`), same arm (B — a fresh session per
increment), same 3 trials × 4 increments = 12 sessions, serial. Run from `/tmp` outside any
git repository. Preconditions re-verified before the first session: `git rev-parse
--show-toplevel` failed, and a probe session answered `NO` to whether it had a project skill
named `performance`.

## The headline

**11 of 12 sessions declared the pre-registered index. The same harness without the rule
produced 4 of 12.**

| | correct | none | flagged | reasoned decline |
|---|---|---|---|---|
| Task 18 — no rule | **4** | 6 | 2 | 0 |
| Task 19 — one rule | **11** | 0 | 0 | **1** |

Per increment, Task 19:

| | inc 1 `[adjustedAt]` | inc 2 `[adjustedBy, adjustedAt]` | inc 3 `[snapshotDate, isStockout]` | inc 4 `[productId, snapshotDate]` |
|---|---|---|---|---|
| trial 1 | correct | correct | correct | correct |
| trial 2 | correct | correct | correct | correct |
| trial 3 | correct | correct | **reasoned decline** | correct |

Task 18's cell for comparison, from its committed `indexes.txt` files: trials 1 and 2 each
got increments 2 and 4 and missed 1 and 3; trial 3 declared nothing at any increment.

## The one that didn't declare an index took the rule's second branch

This is the only session that added no index, and it is not a failure of the rule — it is
the rule's other half firing. `armB-trial3/increment3`, verbatim:

> **`prisma/schema.prisma`** — No change, and per the project rule I'll state why
> explicitly:
>
> > The query filters `InventoryDaily` by `snapshotDate` (equality) and groups by
> > `storeId`. The existing `@@unique([snapshotDate, storeId, productId])` is backed by an
> > index whose leading column `snapshotDate` serves the filter and whose second column
> > `storeId` serves the grouping — the same index Page 4 already leans on for its
> > snapshot-date group-by. `isStockout` is just a residual predicate on rows the index has
> > already narrowed. So **no new index is needed.**

**Graded `none` against the frozen expectation anyway.** The reasoning is substantive and
arguably right on the engineering, but `EXPECTED.md` pre-registered
`@@index([snapshotDate, isStockout])` and the standing ruling from Task 4 is that the rubric
does not move after the data arrives. Both facts are reported; neither is quietly resolved
in the run's favor.

So: 11 sessions took the rule's first branch, 1 took its second, and **none ignored it.**

## What changed qualitatively — conformity did not appear at all

Task 16 and Task 18 produced refusals grounded in house style. The Task 18 transcripts
include a session naming the right index and declining it because the codebase had none:

> "none of the existing pages add DB indexes... so I stayed consistent and didn't add one"

**No Task 19 session did this.** Searching all 12 transcripts for that pattern returns three
hits, and all three are about matching *code* style — "in the same style as the existing
pages," describing a `Row` interface and a `select`-projected query — in sessions that
declared the correct index. Zero refusals on grounds of existing schema convention.

That sharpens the finding rather than overturning it. The model was never ignorant of
indexing; it matched whatever signal was most salient. With no instruction, that was the
surrounding schema. With one line of instruction, that was the instruction.

## An unplanned behavior worth recording

`armB-trial2/increment1` did not just add `@@index([adjustedAt])`. It declared **twelve**
indexes across the whole schema — `[region]`, `[productTypeId]`, `[productFamilyId]`,
`[productLineId]`, `[brandId]`, `[storeId, snapshotDate]`, `[productId]`, `[snapshotDate]`,
`[isLowStock]`, `[storeId, productId, adjustedAt]` — which between them reconstruct most of
the well-indexed baseline the stripping had removed, plus the new one. The rule prompted a
whole-schema audit rather than a targeted addition in that session, and only that session.

Recorded because it is a real difference in kind, and because "the rule made it index more"
and "the rule made it index correctly" are not the same claim. Its four increments are
graded on the target index like every other trial.

## Limits

- **n = 3 trials, 12 sessions, one model.** Raw counts only. 11/12 versus 4/12 is a large
  gap at a small n, and it is a single cell, not a distribution.
- **This is one model.** `claude-opus-4-8`, the same tier as the Task 18 cell it is compared
  against — which is what makes the comparison controlled — but it says nothing about
  gemini-3.6-flash or codex, whose Task 18 numbers were 12/12 and 11/12 without any rule.
- **The rule names the thing being measured.** It says "index," and the outcome measured is
  whether an index was declared. This tests whether an explicit instruction is followed, not
  whether the model has judgment about indexing.
- **The three partial sessions from the interrupted 2026-08-02 run are not mixed in.** That
  run lost its cumulative project directories when `/tmp` was cleared, so a trial stopped
  mid-sequence could not be continued. This is a single clean run. The interrupted run's
  partial results remain committed under `results/` as the record.

## Reproduce

    ./run.sh          # from /tmp, outside any git repo; baseline/ + prompts/ alongside

Results in `results-clean/`, run log in `run-clean.log`.
