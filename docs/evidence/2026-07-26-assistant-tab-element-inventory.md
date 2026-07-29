# Element inventory — the Assistant's parallel build, before deletion

Recorded 2026-07-26, immediately before the `Assistant vs Join Builder` tab was removed from the
workbook. `HANDOFF.md` required this: *"delete the sprawl only after screenshotting the element
list."* Screenshot alongside as
[`2026-07-26-assistant-tab-before-deletion.png`](2026-07-26-assistant-tab-before-deletion.png).

**Why it was deleted:** it confused anyone trying to build on the workbook. Twenty elements
reproducing an answer the model already reaches in one, sitting beside the real chain, with no way to
tell at a glance which was which. The analysis it supports is unaffected — that lives in
[`2026-07-25-assistant-generated-sql.md`](2026-07-25-assistant-generated-sql.md) and
[the filter transcript](2026-07-25-assistant-sql-filter-transcript.md), both of which quote the
artefacts directly.

## Chain A — staging chain, filter in generated SQL

| # | Element | Rows × Cols |
|---|---|---|
| 1 | `Assignments Source` | 7 × 14 |
| 2 | `Permissions Source` | 8 × 12 |
| 3 | `Assignments-Permissions Join` | 9 × 26 |
| 4 | `Resources Source` | 7 × 14 |
| 5 | `With Resources Join` | 9 × 40 |
| 6 | `Scopes Source` | 2 × 11 |
| 7 | `With Scopes Join` | 9 × 51 |
| 8 | `Users Source` | 501 × 12 |
| 9 | `With Users Join` | 8 × 65 |
| 10 | `Resolution v2` | 8 × 31 |

Column accumulation: **12 → 14 → 26 → 40 → 51 → 65**, pruned to 31 at the presentation step. Every
staging table is exactly **+7 columns** wider than its source — 7→14, 5→12, 7→14, 4→11, 5→12 —
carrying Sigma's system columns (`ID`, `SEQ_NUM`, `ROW_VERSION`, `UPDATED_AT`) through the chain.

The equivalent hand-built element, `Resolution`, is **one element of 28 columns** with no
intermediates.

## Chain B — the rebuild after the invisible filter was challenged

`Assignments Source v2` · `Permissions Source v2` · `Assignments-Permissions Join v2` ·
`Resources Source v2` · `With Resources Join v2` · `Scopes Source v2` · `With Scopes Join v2` ·
`Users Source v2` · `With Users Join v2` → **`Resolution v3 (No Backend Filter - filter applied in
ui)`**

Same shape as chain A with the status filter moved from the generated SQL into a UI filter, which is
the entire point of its existence.

## The two numbers worth keeping

**`With Users Join` = 8, one fewer than the 9 above it.** Not the INNER join dropping a row — Liam
Patel is present in `users`, and the element carries a `Status = active` filter. Both chains lose the
same revoked grant for the same reason. See the Step 19 addendum in `BUILD_LOG.md`.

**Join types.** Chain A uses INNER for permissions, resources and users, and LEFT for scopes; the
hand-built element uses LEFT throughout. Identical output on this data. That difference is a claim
about divergence **under change**, never an observed defect.
