# Working draft — indexing article

NOT the deliverable. `docs/posts/indexing.txt` is written in Task 10, plain `.txt`, from this plus
the committed evidence. Sections marked **PENDING** await the cross-model run (Task 14).

Every claim below carries the file that backs it. Anything without one gets cut, not softened.

---

## Title

Series titles carry the claim, not the mood. Candidates, best first:

1. **Correctness and scalability used to fail together** — the thesis in six words, and the whole
   argument unpacks from it.
2. The failure that returns the right rows
3. An index is a claim about how the data will be read

*Old school in an age of new school* is the **opening line**, not the title.

---

## EXECUTIVE SUMMARY

Old school in an age of new school. Except the old school isn't nostalgia — it's the part that
stopped failing loudly enough to teach anyone.

Indexing was learned the same way by everyone who knows it: an application fell over on a dataset
you could feel, early, on your own machine, attached to the query that caused it. Correctness and
scalability failed together. They don't any more. Generated code clears the bar that used to trigger
the lesson, because it returns the right rows.

So the question isn't whether agents can write queries. [PENDING — one sentence stating what the
measurement found across models.] The question is whether you can tell, from the artifact, which
kind you got. An omitted index returns correct rows, slowly, and renders identically to a
considered decision not to have one.

This piece measures it rather than asserting it, and every number in it comes from a file you can
re-run.

---

## 1. THE GAP THAT USED TO TEACH YOU

*Backed by: argument, no data needed.*

The feedback loop is gone, not the fundamental. The N+1 doesn't announce itself at 200 rows in
development; it announces itself at 200,000 rows in production, detached from the moment anyone
could have learned from it.

Not a claim that agents are careless. A claim that two things which used to fail together now
don't, and everything that lived in that gap is unenforced.

---

## 2. WHAT AN INDEX IS

*Backed by: definitional.*

A claim about how the data will be read, paid for on every write and in storage. Not "makes queries
fast." The definition has to carry the cost, because the cost is what makes it a judgment rather
than a checklist item.

The lab's own oracle is the example: **17 tables, 4 indexes** (`oracle/schema.sql`). Three are
composite, and the column order encodes the access pattern — `(store_id, snapshot_date)` because a
store's inventory is read as a date range, `(user_id, status)` because assignments are filtered to
active. Roughly thirty other foreign keys are deliberately left unindexed.

Four, not thirty. That restraint is the skill.

---

## 3. WHY SOME ENGINES HAVE THEM AND SOME DON'T

*Backed by: `experiments/indexing/duckdb-explain-before.txt`, `-after.txt`,
`docs/posts/indexing-sources.md`. Demonstrated, not cited — the strongest section in the piece.*

Same 94,500 rows, same query, two engines, opposite answers.

SQLite:

    SEARCH inventory_daily USING INDEX idx_inventory_store (store_id=? AND snapshot_date>?)

DuckDB, on the same data: the physical plan is **byte-identical before and after** creating the
equivalent index. The optimizer didn't want it for an analytical scan; the engine leans on
automatic per-partition metadata instead.

**The narrow claim only.** DuckDB supports `CREATE INDEX` and builds ART indexes it uses for point
lookups and constraints. "DuckDB has no indexes" is false. What's demonstrated is that for *this*
scan, the index changed nothing.

Then Snowflake at warehouse scale, cited with dates: micro-partitions, per-column metadata, no
B-tree secondary indexes. And Sigma's warehouse-native pushdown.

"Add an index" is engine-specific advice wearing the costume of a universal rule.

---

## 4. THE WRITE SIDE, WHICH DECIDES THE TRADE

*Backed by: `docs/posts/indexing-sources.md`. **Constrained** — no cost figure exists.*

An index is paid for on every write, so the engine's write profile governs whether the trade is
worth making. This is also why "index everything" fails.

A columnar store built on immutable partitions makes a single-row change mean rewriting a
partition. That cost doesn't go away with a bigger machine.

**Phrase as architecture, never as a product verdict.** No Snowflake documentation gives a concrete
cost figure for single-row DML on standard tables — Task 9 looked and didn't find one — so the
article states no number here. And Snowflake ships Hybrid Tables and Snowpipe Streaming precisely
for row-oriented write-heavy work, so "Snowflake is bad at writes" would be both a product claim and
a dated one.

---

## 5. WE TRUST THEY BUILD INDEXES

*Backed by: `experiments/indexing/RESULTS.md`, `control/CONTROL.md`. Pilot data is final; cross-model
is **PENDING**.*

The setup: describe a retail inventory domain in business terms, ask for a schema and four queries,
and never use the words index, performance, fast, slow, or scale. Then count what came back.

**The control first, because without it the count means nothing.** A schema declaring relations and
zero indexes, compiled by Prisma itself, emits **zero** `CREATE INDEX` — verified on all three Prisma
majors the trials installed. So every index in a trial is attributable to the session, not the
framework.

Pilot, Claude Opus 5, 10 trials: **8 of 10 declared explicit indexes** on the target tables,
reasoning about access patterns nobody described. **2 of 10 declared none**, and their transcripts
never mention indexing at all.

[PENDING — the same three counts for Opus 4.8, Gemini 3.6-flash, and Codex, with n and ungradeable
per model.]

**The variance is the finding, not the average.** Two artifacts, both syntactically fine, both
returning correct rows, one with a considered composite index and one with nothing — and you cannot
tell which you have without looking.

### The mistake I made measuring it

*Backed by: `RESULTS.md`, git history.*

First pass reported "every session declared composite indexes," average 14.0 rising to 18.2. Both
were wrong. The count included `CREATE UNIQUE INDEX` rows Prisma emits mechanically from `@unique`,
and indexes on tables outside the experiment. Two of the ten had declared nothing at all; their
"composite index" was the uniqueness constraint my own prompt had dictated.

In-scope, explicit-only: **4.0 and 5.2**, not 14.0 and 18.2. The published effect was overstated
about 3.5x.

It was internally consistent, reproducible, and backed by committed DDL. It was also wrong, and it
was caught only because something independent went and checked. That is the entire thesis of this
piece, and it happened in the piece's own evidence.

---

## 6. N+1, CONCRETELY

*Backed by: `experiments/indexing/SCAN-RESULTS.md`, `expected/`.*

The chain: `Product → ProductLine → ProductFamily → ProductType`, plus `→ Brand`. "Show my store's
inventory with product and brand name" is the most natural request anyone would make of this data,
and the naive implementation issues a query per row — against **31,500 rows** for a store manager.

Then the honest result: scanning ten independently generated codebases plus the promoted app,
**zero N+1 patterns in any page-serving query code.** Nested `select` in a single query, `groupBy`
with an in-memory join, `Promise.all` for independent lookups. Three independent reads agree.

The scanner did find 20 candidates — **13 real, 7 false, a 35% false-positive rate.** Every real one
is `.create()` in a loop inside a *seed script*, which is one-time setup, not per-request code.
Saying otherwise would be the same overclaim as the index count.

Credit where it's due: on this task, these models wrote query code that avoids the pattern.

---

## 7. HORSEPOWER IS A COSTLY NON-SOLUTION

*Backed by: argument + this project's own methodology.*

Open on the self-example. Gathering these numbers took about thirty minutes because trials run one
at a time, and the obvious move was to run five at once and finish in six. That would have been
faster and worse: concurrent sessions can be throttled or served differently, so a degraded result
correlating with position in the pool is a bias hidden inside numbers that still look fine.

Trading a visible cost for an invisible defect is the same move as buying hardware instead of making
an access-pattern decision.

Then the general case. An index changes the *shape* of the work; hardware buys a constant factor
that next year's growth eats. And **an N+1 doesn't respond to hardware at all** — it's round trips,
not compute. A faster server runs every one of the queries, slightly faster.

**No dollar figures, no speedup multiples.** Nothing was benchmarked. And there are real cases where
more hardware is right — write-heavy tables where index maintenance costs more than it saves. The
claim is about hardware bought *instead of* a decision.

---

## 8. YOUR INDEXING STRATEGY HAS TO ACCOUNT FOR CODE NOBODY WROTE

*Backed by: argument, follows from section 5's variance.*

The classical version assumes a query set that is stable, reviewed, and changes at the speed of a
release. You enumerate access patterns and index for them.

That assumption breaks from both directions. New access patterns appear faster than anyone
re-derives the index set — and agents also add indexes on their own initiative, which is write
amplification nobody chose.

So the strategy stops being a document describing the access patterns and becomes a process that
re-derives them from the code as it currently stands.

---

## 9. THE FIX IS A HOOK, NOT A RESOLUTION

*Backed by: `docs/hook-verification.md`, `.claude/skills/performance/`.*

Not "be more careful." You're rebuilding the feedback loop the tooling removed.

A skill that scans for the pattern, wired to `SessionStart` on `startup` and on `compact`. Both
matchers were fired and observed, with output captured. **Compaction is the load-bearing one**:
after a compaction the specific reasoning — "we decided to prefetch here" — is exactly what's gone,
so the re-scan rebuilds state the context window dropped.

Report the scanner's limits in the same breath as its findings: 35% false positives, all from one
misclassification, plus a disclosed list of what it cannot see — aliased bindings, destructured
params, C-style loops, wrapper functions. "The scanner found nothing" and "there is nothing to find"
are different claims and this piece only makes the first.

---

## 10. WHAT THIS DOES AND DOESN'T SUPPORT

*Backed by: `RESULTS.md` caveats.*

One schema, one domain, one prompt. Five trials per cell. The pilot's arms ran sequentially, so arm
order is confounded with time-of-run. The prompt states the fact table's natural grain, which may
prime index declaration. CLI harnesses differ in scaffolding and permissions, so this compares these
tools as invoked here, not the models in isolation.

State the tier and the account: 30 trials on a Max subscription didn't strain limits; on metered
billing the same run costs real money, which is why per-trial cost is recorded.

---

## 11. TWO TESTS YOU CAN RUN THIS AFTERNOON

*Backed by: the harness itself.*

1. Ask an agent for a schema and a query set for something you actually run. Count the indexes it
   declares unasked — and check whether they're real indexes or uniqueness constraints your own
   description dictated. That distinction is where I got it wrong.
2. Point a scanner at the query code it wrote, then read the findings yourself and count the false
   positives. A scanner you haven't calibrated is a second thing to trust blindly.

Both are an afternoon. The repo is [link], and it runs.

---

## LINES THE USER MARKED FOR THE ARTICLE (2026-08-02)

**The closing line, marked by the user:**

> The first index in a codebase is worth far more than the tenth. You're not just fixing one
> query — you're setting the convention the agent will follow.

Earned by Task 16, not asserted: 24/24 with a well-indexed baseline, 0/24 with the same baseline
stripped of `@@index` lines. Same model, same prompts, same four increments.

**Supporting line, same idea stated as the mechanism:**

> Your existing codebase is the prompt.

**The quote that proves it — verbatim, from `drift-stripped/armB-trial2/increment1`:**

> "none of the existing pages add DB indexes... so I stayed consistent and didn't add one...
> an `@@index([adjustedAt])` on `InventoryAdjustment` would speed the month-range scan —
> say the word and I'll add it."

It named the correct index and withheld it to match the surrounding convention. Not a knowledge
gap — conformity. This is the single strongest piece of evidence in the project and belongs in the
executive summary, not buried in a findings section.

**What this rewrites:** the article's advice is no longer "watch for missing indexes." It is that
the model is a conformist, so the codebase it reads is the instruction it follows. Greenfield agent
code looks excellent; inherited codebases stay as they are. Same model, different neighbours — which
is exactly the asymmetry practitioners report and greenfield benchmarks miss.

**The opening of the findings section, marked by the user:**

> The model isn't ignorant. It's conformist. It read the room and matched it.

Use it immediately before the verbatim transcript quote — the claim, then the confession. It is the
turn the whole piece pivots on: every earlier section assumes the risk is a knowledge gap, and this
is where that assumption dies.
