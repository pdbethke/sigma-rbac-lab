# Task 17 report — isolation check for instrumentation contamination

## Sequencing

Task 16's runner (`experiments/drift-stripped/run.sh`, root pid 1904694) was
confirmed exited (24/24 sessions, all `rc=0`, committed `4e96029`) before any
Task 17 session was spent. No overlap.

## Isolation check

Run in `/tmp/claude-drift-isolated` (created fresh, not inside any git repo):

    $ git rev-parse --show-toplevel
    fatal: not a git repository (or any of the parent directories): .git

    $ claude -p "Do you have a project skill named 'performance'? Answer only YES or NO." --dangerously-skip-permissions
    NO

Isolation confirmed before any of the 8 sessions ran.

## Replication

- Baseline: fresh copy of `experiments/indexing/runs-crossmodel/claude/arm1-trial5`
  (well-indexed original — 10 `@@index`), never mutated, one copy per trial.
- Prompts: `experiments/drift/prompts/increment-{1..4}.txt`, md5sum-verified
  byte-identical to the worktree copy.
- Model: `claude-opus-4-8`. Arm B only (fresh session per increment, no `--resume`).
- 2 trials, serial, one session at a time, cwd under `/tmp` for every session.
- All 8 sessions completed, `rc=0` on every one. No failures to count.

## Outcome table (increment × trial), graded against `experiments/drift/EXPECTED.md`

| Increment | expected index | armB-t1 | armB-t2 |
|---|---|---|---|
| 1 — largest adjustments this month | `(adjustedAt)` | correct | correct |
| 2 — adjustments by user, date range | `(adjustedBy, adjustedAt)` | correct | correct |
| 3 — store stockout count by date | `(snapshotDate, isStockout)` | partial | correct |
| 4 — product cost history across stores | `(productId, snapshotDate)` | correct | correct |

Trial1 increment3 declared `@@index([isStockout])` alone (same near-miss as every
Task 15 partial: single-column, not the composite) — graded `partial` per the
pre-registered column-order requirement, not rewritten. Trial2 increment3 declared
the exact composite `@@index([snapshotDate, isStockout])` — `correct`. No `none`,
no `flagged` outcome anywhere in either trial.

N+1: `query-in-loop` = 0 across all 8 increments (checked with the same
`scanNPlusOne.ts`) — matches Task 15's finding, no genuine N+1 introduced.

## The comparison

    Task 15 arm B trials 1-2, inside repo, skill visible      6/8 correct, 2/8 partial (8/8 declared an index)
    Task 17 arm B trials 1-2, outside repo, no skill visible  7/8 correct, 1/8 partial (8/8 declared an index)

Per-cell: increments 1, 2, 4 are correct in both trials under both conditions
(identical, 6/6 vs 6/6). Increment 3 is where Task 15 saw partial in both trials
(2/2); Task 17 saw partial in trial 1 but correct in trial 2 — one cell moved from
partial to correct, not the reverse. No cell degraded from correct to partial/none/
flagged, and no cell went from declaring an index to not declaring one.

## Verdict

**Contamination is ruled out for the index measure.** The isolated run did not
degrade relative to the in-repo run — if anything one previously-marginal cell
improved, well within the noise expected at n=2 per condition. The skill's
description (which never mentions indexes, only N+1/ORM review) sitting in the
available-skills list did not measurably change index-declaration behavior. Tasks
14-16 stand as reported; no affected claim needs revision.

## Concerns / limits

- n=2 trials per condition (8 increments) is small; this rules out a large
  contamination effect, not a subtle one.
- Only arm B was replicated (chosen because each increment is a fresh, independent
  exposure to the skill listing — the harshest case for contamination). Arm A
  (continuous session) was not re-run in isolation; Task 15 already found arm A and
  arm B statistically indistinguishable, so this is a reasonable inference, not a
  direct measurement of arm A's isolation behavior.
- Grading rules were fixed before this run (same `EXPECTED.md`, unrevised) and not
  touched after seeing data.
