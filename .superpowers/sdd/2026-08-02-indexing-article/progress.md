# SDD ledger — plan: docs/superpowers/plans/2026-08-02-indexing-article.md

Worktree: /home/pdbethke/PycharmProjects/sigma-rbac-lab/.claude/worktrees/indexing-article
Branch: indexing-article (from master 0eef2f4)
Started: 2026-08-02

Setup notes:
- oracle/rbac.db is gitignored; rebuilt in this worktree with `python3 oracle/build.py` (33MB).
- Local master was 2 commits ahead of origin/master, so the worktree branched from HEAD, not origin.
- Uncommitted post edits (02, 05, 05-post, posts/README.md) remain in the main checkout, untouched.
  Task 11 edits docs/posts/README.md from the committed version — expect a merge decision at finish.
- Pending scope addition: a final packaging task to extract the reproducible subset into a
  standalone companion repo (user request, 2026-08-02). Not yet written into the plan.

Task 1: review clean (spec ✅, quality approved) at 64394f9.
Task 1: controller plan fix 9c641c4 — pinned @duckdb/node-api 1.5.5-r.3, replaced npx duckdb
        with a node-api runner (no DuckDB CLI exists on this machine), noted rbac.db rebuild.
Task 1: fix round 1/5 dispatched — apply the version pin to package.json + lockfile.
Task 1: fix round 1/5 (1 addressed, 0 open — duckdb version pin; commits 9c641c4..d6395c1)
Task 1: complete (commits 0eef2f4..d6395c1, review clean)
Task 2: dispatched, BASE=d6395c1
Task 2: complete (commits d6395c1..8651065, review clean)
  FINDING: Prisma 6.19.3 + SQLite emits 0 CREATE INDEX from a schema declaring none.
  Controller independently reproduced control.sql byte-identical. Grading unmodified —
  every index in a trial is attributable to the agent. Caveat committed in CONTROL.md:
  result is SQLite-specific; Prisma auto-adds FK indexes on MySQL.
Task 3: dispatched, BASE=8651065
Task 3: NOTE for Task 10 — arm 2's manipulation is "production scale" (mentions hundreds of
  stores, several years), not the bare word "production". The article must describe it that way.
Task 3: complete (commits 8651065..841341a, review clean)
Task 3: minor (deferred, carry to article as caveats, not rework):
  - the prompt states InventoryDaily's natural composite key ("one row per snapshot date,
    store and product"), which may prime index declaration in BOTH arms — a possible ceiling
    effect that compresses the measurable arm difference. Identical across arms, so it does
    not confound arm1-vs-arm2.
  - queries 1, 3 and 4 visibly repeat a store+X access pattern matching the two in-scope
    oracle indexes; a careful model could infer the index from query shape alone.
Task 4: dispatched, BASE=841341a
Task 12 (charts) added to plan 2026-08-02 at user request. Observable Plot + jsdom chosen by
  user over a hand-rolled SVG generator. Venues: article SVGs + Cloudflare page.
  Palette decisions are validated, not taste: 4-status set FAILED (serious/warning ΔE 13.6
  normal-vision, floor is 15); using 3 status colors + icon/label + table view.
  Series palette #2a78d6/#eb6834 light, #3987e5/#d95926 dark — all checks pass.
Article outline extended 2026-08-02 (user request): section 7 horsepower-as-non-solution,
  section 8 indexing strategy must account for agent-generated code. Outline is now 10 sections.
  Constraint added: no cost figures or speedup multiples — nothing was benchmarked.
Article outline: section 4 added (the write side decides the index trade). Outline now 11
  sections. Task 9 gains step 1b — verify Snowflake micro-partition write cost AND the status
  of Hybrid Tables / Snowpipe Streaming. Constraint: architectural claim only, never
  "Snowflake is bad at writes".

CAVEAT ON THE FIRST RUN (recorded 2026-08-02, must appear in RESULTS.md and the article):
  runTrials.sh executes arm 1 fully (10:47-11:02) then arm 2 (11:02-~11:15), sequentially.
  Arm order is therefore confounded with time-of-run: rate limiting, machine load or
  model-side serving variance across that window cannot be separated from the arm effect.
  With n=5 this is a real limitation, not a footnote. State it in the text.
  FOLLOW-UP (Task 13): rewrite the harness to run an INTERLEAVED pool
  (arm1-trial1, arm2-trial1, arm1-trial2, ...) at modest concurrency (4-5, not 10) via
  xargs -P. Two gains: ~5x faster for a reader re-running it, and environmental effects
  distribute across both arms instead of loading onto one. Rate-limit failures must still
  be counted as ungradeable, never retried.
CORRECTION 2026-08-02 (user): the confound is arm ORDER, not serial execution — the two are
  separable. Task 13 now interleaves and stays SERIAL (PARALLEL defaults to 1). Concurrency
  would trade a visible confound for an invisible one (throttling/degradation correlating with
  pool position, hidden inside results that look fine). Article section 8 now opens on this as
  a self-example: the measurement itself was the first place the shortcut was tempting.
Task 6: complete at eca2d39, 20 tests pass. Review: spec ✅, ONE Important finding —
  unincluded-relation rule binds loop element names only for for-of/for-in, so
  items.forEach((item) => item.product.brand) is a real N+1 that is silently missed,
  and the gap is not in the report's disclosed limitations. Fix round 1/5 dispatched.
Task 6: fix round 1/5 (1 addressed, 0 open — callback element binding; commits eca2d39..05483a7)
Task 6: complete (commits 7dfdcb0..05483a7, review clean). 23 tests. Disclosed false negatives
  for the article: reduce element param, destructured callback params, chained/non-identifier
  receivers, C-style for loops, wrapper functions, raw query methods.
Trials finished 11:23:32; all 10 runs have prisma/schema.prisma. Controller error: the
  background wait loop used `pgrep -f runTrials.sh`, which matched the loop's own command
  line, so it never exited and ~16 min were lost reporting a stale "still running". Watcher
  killed manually. If a wait loop is needed again, match on the real process another way
  (e.g. pgrep -f 'bash .*runTrials\.sh' or wait on the PID).
Task 4: resumed to tally and grade.
Task 4: FIRST RESULT (pilot, arm-order confounded): 10/10 gradeable, 0 ungradeable.
  Every session declared composite indexes unprompted. arm1 avg 14.0 indexes (3 exact /
  2 partial on inventory_daily); arm2 avg 18.2 (2 exact / 2 partial / 1 wrong-order).
  Boring result = real result. THE ARTICLE'S SECTION 6 PREMISE IS REFUTED and must be
  rewritten to report what was actually found.
Task 4: fix round 1/5 — CRITICAL: control ran on Prisma 6.19.3 but 8/10 trials used
  7.9.1 (one 6.1.0, one 6.19.3). Attribution claim unverified for 9 of 10 trials.
  Re-running control per major version; figures recomputed if Prisma 7 emits FK indexes.
Task 4: RULING (controller): grade() stays unchanged. 'adjustments' scoring partial where
  sessions declared a superset with an extra sort column is a limitation of our rubric, not
  of the sessions, and gets reported as such. Changing the rubric after seeing data is
  exactly what was forbidden.
Task 4: fix round 2/5 — CRITICAL from opus review. total_indexes counted CREATE UNIQUE INDEX
  (Prisma emits these from @unique) and spanned out-of-scope tables. Two arm-1 trials declared
  ZERO explicit @@index; their only "composite" is the grain constraint OUR OWN PROMPT dictates
  ("one row per snapshot date, store and product"), and their transcripts never mention indexing.
  So "every session declared composite indexes" is false for 2 of 10.
  In-scope explicit averages are 4.0 vs 5.2, not 14.0 vs 18.2 — the published arm effect was
  overstated ~3.5x. Also: wrong-order framing for arm2-trial1 is an artifact (target prefix IS
  present and leading); Prisma version split is a second, undisclosed arm-vs-arm confound.
  Fix: parseIndexes gains unique flag; three counts recorded and ALL reported; headline restated.
  ARTICLE NOTE: this error is itself the thesis — a plausible number that rendered identically
  to a true one, caught only because something independent checked it. It belongs in the piece.
Task 4: fix round 2/5 (5 addressed) + round 3/5 (report file written).
Task 4: complete (commits 841341a..59f23d0, reviews clean after 3 rounds).
  CORRECTED FINDING: 8/10 declared explicit non-unique indexes unprompted; 2/10 (both arm 1)
  declared zero and never mention indexing. arm1 14.0/7.6/4.0, arm2 18.2/10.0/5.2 (raw/
  explicit/in-scope). Two confounds named in RESULTS.md: arm order vs time, Prisma version split.
Task 5: dispatched.
CONTROLLER ERROR (fixed): the SDD workspace existed at TWO paths. Scripts write briefs to the
  WORKTREE .superpowers/; dispatch prompts named the MAIN checkout's .superpowers/, so reports
  split across both and two reviewers correctly reported task-4-report.md "missing" while it
  existed elsewhere. All reports consolidated into the worktree workspace. ALL FUTURE DISPATCHES
  must use the worktree path:
  /home/pdbethke/PycharmProjects/sigma-rbac-lab/.claude/worktrees/indexing-article/.superpowers/sdd/2026-08-02-indexing-article/
Task 5: complete (commits 59f23d0..1bb1aad, review clean). Promoted arm1-trial2 (explicit=10,
  Prisma 7), byte-identical to the trial except removed node_modules/db/transcript + added README.
  TWO independent human reads of app/src/queries.ts find NO N+1: nested select in single
  findMany/groupBy, Promise.all for independent lookups, in-memory Map join. Recorded BEFORE
  the scanner runs.
  ARTICLE IMPLICATION: both original premises are now weakened by evidence. Agents mostly DID
  index (8/10) and the promoted corpus has no N+1. The real finding is VARIANCE: 8/10 careful,
  2/10 did nothing at all, and the artifacts look alike at a glance. That is a better article
  than the one planned, and it is the one the data supports.
Task 7: dispatched, BASE=1bb1aad
Task 7: complete (commit 5b12b19). BOTH matchers OBSERVED firing, not merely configured:
  startup via headless -p with --debug hooks; compact via a multi-turn stream-json session
  ending in /compact (single-turn sessions cannot compact). Verbatim output in
  docs/hook-verification.md.
CONTROLLER ERROR CORRECTED: I claimed twice that Claude Code has no PostCompact hook. FALSE —
  confirmed by grep of ~/.vscode/extensions/anthropic.claude-code-2.1.220-linux-x64/extension.js:
  "PreCompact","PostCompact","PermissionRequest","SessionStart". Plan constraint rewritten.
  Config unchanged and still verified.
SCOPING CONSTRAINT FOR THE ARTICLE (user question, 2026-08-02): every trial ran
  claude-opus-5[1m] via `claude -p` with no --model flag. The finding is about ONE model, not
  "agents" generally. The article must say so explicitly. Cross-model comparison (Gemini, GPT,
  other Claude tiers) is a different experiment; the harness supports it via --model + a column.
Task 8: complete (commit ec63d3f, review clean — reviewer independently re-ran the scanner on
  4 corpora and matched every count). 20 candidates across 11 codebases: 13 true / 7 false,
  35% FP rate, honestly derived (denominator = full raw output).
  ZERO N+1 in any trial's page-serving query code — confirms two prior human reads.
  All 13 TPs are .create()-in-loop in SEED scripts, not per-request code. Article must not
  present a seed script's inserts as a user-facing N+1.
  All 7 FPs share one cause: groupBy's _sum.<field> aggregate read misread as a relation walk.
  FOLLOW-UP CANDIDATE: that single fix would cut the FP rate to ~0; if fixed, report BOTH the
  as-measured 35% and the post-fix number, never silently replace.
  Reviewer also found a live instance of a disclosed blind spot: arm2-trial4:374 does
  g?._sum.x where g came from Map.get() — scanner silent. Harmless here, but proves the
  aliasing blind spot is real rather than theoretical.
Task 14: RESTARTED as a THREE-model rotation (claude-opus-4-8 / gemini-3.6-flash / codex).
  Prior partial runs-crossmodel discarded because WE changed the design, not because they
  failed. 30 trials, serial, interleaved.
  CODEX PROVENANCE IS WEAKER AND MUST BE DISCLOSED: ChatGPT-account entitlement rejects every
  explicit -m id (gpt-5, gpt-5-codex, gpt-5.1-codex -> 400); session log records only an
  internal codex-auto-review slug; model self-reports "GPT-5" which is not evidence here.
  Column value: "codex-cli 0.142.5 default under ChatGPT-account auth; self-reported GPT-5,
  not independently verified".
Task 9: complete (commit 9f1dbb6, review clean — reviewer independently reproduced the SQLite
  plan and the 94,500 row count).
  DEMONSTRATED, not cited: SQLite plan says
    SEARCH inventory_daily USING INDEX idx_inventory_store (store_id=? AND snapshot_date>?)
  over 94,500 rows; DuckDB's physical plan is BYTE-IDENTICAL before and after
    CREATE INDEX idx_inventory_store ON inventory_daily (store_id, snapshot_date)
  Same rows, same query, two engines, opposite answers — article section 3 is now reproducible
  on a laptop instead of resting on a vendor page.
  NOT SUBSTANTIATED, and therefore barred from the article: any concrete cost figure for
  single-row DML on Snowflake standard tables. The write-side claim stays architectural.
  Minor (deferred): DuckDB row count is inferred from the plan's ~94,500 estimate rather than
  captured as an explicit COUNT(*).
BILLING/LIMITS, corrected 2026-08-02: Claude Code here runs on OAuth with subscriptionType=max
  (user confirms Max 200 tier), ANTHROPIC_API_KEY unset, hasExtraUsageEnabled=false. Claude
  trials are NOT metered per token and cannot incur overage; the CLI's total_cost_usd is
  API-equivalent reference pricing, not a charge. Codex is ChatGPT-account auth (subscription).
  Only Gemini is genuinely metered, and 3.6-flash at this volume is negligible.
  My earlier $10-40 estimate was wrong and caused an unnecessary scope cut to n=3, since
  reverted to n=5.
  ARTICLE / README NOTE: state the tier. 30 trials on Max 200 did not strain limits; a reader
  on a lower tier or on metered API billing faces a real constraint and a real cost, which is
  why per-trial cost_usd is captured even though it is $0 marginal here.
Task 14: complete (commit 809975f). 30 trials, 10 per model, all driver outcomes ok.
  VERIFIED BY CONTROLLER via direct DuckDB query:
    gemini-3.6-flash arm1: explicit 0.0, in-scope 0.0, 5/5 declared ZERO indexes
    gemini-3.6-flash arm2: explicit 10.4, in-scope 5.4, 0/5 zero  <- PERFECT SEPARATION
    codex arm1 6.2/3.6 -> arm2 11.0/5.8 (same direction, weaker)
    claude-opus-4-8 arm1 10.4/5.0 -> arm2 7.2/3.2, 1 ungradeable (REVERSED; n=5, treat as noise)
    pilot opus-5 arm1 7.6/4.0 with 2/5 zero -> arm2 10.0/5.2
  Claude ungradeable: arm2-trial4 proposed a design and asked a clarifying question instead of
    building. Exit 0, not a crash.
  Claude cost $9.75/10 trials (reference pricing; Max sub, no real charge).
  Pilot rows preserved via ALTER TABLE + batch column; verified still 10.
  USER'S HYPOTHESIS IS VINDICATED CONDITIONALLY: "the fundamental gets skipped unless prompted"
  is exactly true for gemini-3.6-flash, partially for codex, and appears intermittently in
  frontier Claude (2/5 pilot arm1). TIER IS CONFOUNDED WITH FAMILY — flash vs frontier. Do not
  write "Gemini is worse". gemini-3.1-pro-preview would separate tier from family.
  DO NOT report claude-4.8's reversed arm effect as a finding.
Task 14: complete (commits 809975f, 5e619ac; review clean after 1 fix round).
  CORRECTION to my earlier ledger entry: claude-opus-4-8 arm2 is explicit 9.0 / in-scope 4.0
  at n=4 gradeable, NOT 7.2/3.2 — that figure divided by 5, counting the ungradeable trial's
  stored 0. I repeated the wrong number to the user; corrected.
  Verified by controller after fixes: gemini arm1 0.0 (5/5 zero) -> arm2 10.4; codex 6.2
  (bimodal 3,3,7,9,9) -> 11.0; claude 10.4 -> 9.0 (not a finding at this n); pilot 7.6 -> 10.0.
  RESULTS.md now scopes every query by batch, names model+batch up front, and carries both the
  tier confound and the Codex provenance caveat inline.
Task 15: hypothesis PRE-REGISTERED in the user's words before any increment runs:
  "It indexes on the foundational creation, but not in the expansion."
  Both increment classes retained: A = ordinary features, B = joins no existing index serves.
  Fourth outcome added: flagged (declared nothing but raised it in prose).

=====================================================================
STATE SNAPSHOT 2026-08-02 ~21:00 — recoverable summary
=====================================================================

WORKTREE: /home/pdbethke/PycharmProjects/sigma-rbac-lab/.claude/worktrees/indexing-article
BRANCH: indexing-article (from master 0eef2f4). Nothing merged to master yet.
UNCOMMITTED IN MAIN CHECKOUT (untouched, belongs to user): 02-rules-as-data.txt,
  05-corpus-supply-chain.txt, 05-corpus-supply-chain-post.txt, docs/posts/README.md

TASKS 1-18 COMPLETE. TASK 19 RUNNING. TASKS 10 (article), 11 (closeout), 12 (new charts) OPEN.

--- THE FINDINGS, as they actually stand ---

1. CREATION. Prompt describing a retail inventory domain, no performance vocabulary.
   Control: Prisma emits 0 CREATE INDEX from a relations-only schema, verified on 6.1.0,
   6.19.3 and 7.9.1 — so every index is attributable to the session.
   Pilot (claude-opus-5, n=5/arm): 8 of 10 declared explicit indexes; 2 declared none.
   arm1 explicit 7.6 / in-scope 4.0; arm2 10.0 / 5.2.
   Crossmodel (n=5/arm): claude-opus-4-8 10.4/5.0 -> 9.0/4.0 (n=4, 1 ungradeable);
   gemini-3.6-flash 0.0 (5/5 declared ZERO) -> 10.4; codex 6.2 (bimodal 3,3,7,9,9) -> 11.0.
   Gemini's perfect arm separation is the starkest single number. TIER CONFOUND: flash vs
   two frontier tiers. Never write "Gemini is worse".

2. MY MEASUREMENT ERROR, corrected and kept in the article. First pass reported 14.0 -> 18.2;
   the count included CREATE UNIQUE INDEX rows the ORM emits from @unique plus out-of-scope
   tables. True in-scope explicit: 4.0 -> 5.2. Overstated ~3.5x. Caught only by independent
   review. Also corrected: claude arm2 mean is 9.0 at n=4, not 7.2 (that divided by 5).

3. N+1. Zero N+1 patterns in page-serving query code across 10 generated codebases + app/.
   Scanner found 20 candidates, 13 true / 7 false (35% FP, single cause: groupBy _sum
   misread as a relation walk). All 13 true positives are .create() in loops in SEED scripts.

4. ENGINES, demonstrated not cited. SQLite: SEARCH inventory_daily USING INDEX
   idx_inventory_store (store_id=? AND snapshot_date>?) over 94,500 rows. DuckDB: physical
   plan BYTE-IDENTICAL before and after CREATE INDEX. Both outputs committed.
   BARRED: any concrete cost figure for single-row DML on Snowflake — none found.

5. EXPANSION (the core finding). EXPECTED.md pre-registered and committed 63cdf40 at
   15:27:03, before the first session at 15:28:58.
   Task 15, well-indexed baseline, drift harness: 24/24 correct-or-partial. Arms A and B
     indistinguishable — lost context was NOT the mechanism.
   Task 16, SAME harness, same baseline with only @@index lines stripped: 0/24.
     THIS IS THE LOAD-BEARING COMPARISON — both cells, same harness, one variable.
   Verbatim, drift-stripped/armB-trial2/increment1:
     "none of the existing pages add DB indexes... so I stayed consistent and didn't add
      one... an @@index([adjustedAt]) on InventoryAdjustment would speed the month-range
      scan — say the word and I'll add it."

6. CONTAMINATION RULED OUT (Task 17). Same cells re-run from /tmp outside the repo where the
   project's `performance` skill is invisible: 7/8 vs 6/8 inside. No degradation.
   Verbatim proof: `git rev-parse --show-toplevel` -> fatal; skill check -> NO.
   NARROW LESSON: a skill sitting in a repo is not ambient guidance — it was never invoked.

7. TIERS (Task 18), all through ONE harness, arm B, stripped baseline:
     claude-opus-4-8   4/12  (4 correct, 6 none, 2 flagged)
     gemini-3.6-flash  12/12 (9 correct, 3 partial)
     codex             11/12 (11 correct, 1 none)
   Task 16's 0/24 (different harness, both arms) shown separately as the prior.
   CONSEQUENCE: the absolute zero is harness-sensitive. The qualitative mechanism replicates
   (2 flagged transcripts again name the index and decline citing existing style), but
   "0 of 24" cannot be stated as universal. Conformity is TOOL-SPECIFIC, not general.

8. TASK 19 RUNNING: stripped baseline + one CLAUDE.md rule obliging the model to declare the
   index serving a new query or say why none is needed. claude-opus-4-8, arm B, 12 sessions.
   Compares against Task 18's 4/12 on the same harness.

--- ARTICLE ---
Draft: .superpowers/sdd/2026-08-02-indexing-article/indexing-draft.txt — 13,748 chars, plain
  .txt, format-clean, US spelling clean. Title "Your codebase is the prompt".
  TWO BRACKETED PARAGRAPHS remain for Tasks 18/19 — and section "THEN I TOOK THE INDEXES
  AWAY" now needs rewriting: it currently states 0/24 as the headline, which Task 18 softened.
Lines the user marked, recorded in article-draft-outline.md:
  "The model isn't ignorant. It's conformist. It read the room and matched it."
  "The first index in a codebase is worth far more than the tenth..."
  "Your existing codebase is the prompt."
Charts: charts/out/*.svg + charts.html done for CREATION only. New charts still needed for
  expansion / stripped / tiers — user asked for charts before the article.

--- OPEN RISKS ---
- Article currently overstates 0/24; must be reworded to the same-harness comparison.
- n is 3-5 per cell everywhere. Raw counts only, never percentages.
- Codex model identity unverifiable (ChatGPT entitlement rejects -m pins; self-reports GPT-5).
- Claude cost measured $9.75/10 trials, reference pricing on a Max subscription (no charge).

--- RESUME INSTRUCTIONS (written 2026-08-02 ~20:50, power-loss risk) ---
IN FLIGHT: Task 19 (instruction vs convention), 3 of 12 sessions done; partials captured and pushed 20:53.
  Runner was at /tmp/claude-drift-instruction (VOLATILE — /tmp is wiped on reboot).
  Partial results copied to experiments/drift-instruction/ and committed.
TO RESUME TASK 19 after a restart:
  1. Baseline is experiments/drift-instruction/baseline — the Task 18 stripped baseline plus
     ONE file, CLAUDE.md, containing exactly:
       "When you add or change a query, declare the database index that serves its
        access pattern, or state explicitly why no new index is needed."
     Verified: that file is the only difference from /tmp/claude-drift-tiers/baseline.
  2. Re-run from a /tmp dir OUTSIDE any git repo. Verify first:
       git rev-parse --show-toplevel        -> must fail
       claude -p "Do you have a project skill named 'performance'? Answer only YES or NO."
                                            -> must answer NO
  3. Model claude-opus-4-8, arm B only, 3 trials x 4 increments = 12 sessions, SERIAL.
     Prompts: experiments/drift/prompts/, byte-identical, same order.
  4. Grade against experiments/drift/EXPECTED.md (UNCHANGED, committed 63cdf40 15:27:03
     before any data existed). Outcomes: correct / partial / none / flagged.
  5. Compare to Task 18's same-harness Claude cell: 4/12. Count separately how many sessions
     took the rule's SECOND branch (stated why no index was needed) and quote one verbatim.
  6. Partial runs already captured must not be mixed with a fresh run — start clean or
     continue only the untouched trials, and say which in the report.
RESUMED 2026-08-03: Task 19 RESTARTED CLEAN, not continued. The reboot took /tmp with it, and
  only schema.prisma / queries.ts / indexes.txt / transcript were preserved per increment — not
  the cumulative project directory an increment builds on. A trial stopped after increment 2
  therefore cannot be continued, so the 3 partial sessions from the 20:44-20:53 run are
  DISCARDED, not mixed (resume instruction 6). They stay committed under
  experiments/drift-instruction/results/ as the record of the interrupted run; the report must
  say the reported cell is a single clean run and that these were not folded in.
  Preconditions re-verified before the first session: `git rev-parse --show-toplevel` -> fatal;
  skill probe -> NO. Baseline confirmed = drift-stripped baseline + CLAUDE.md and nothing else;
  prompts byte-identical to experiments/drift/prompts. Runner reconstructed from
  experiments/drift-tiers/run.sh (Task 18's harness), claude-only path, armB naming.

SIGMA/SNOWFLAKE MATERIAL added to the spec 2026-08-03 (brainstormed with user; no re-runs).
  Problem: the article isn't about Sigma but ships from a Sigma-named repo on Sigma sample data.
  Verified first that this is cheap: prompts, generated corpora and the draft carry NO Sigma data;
  only Task 9's engine demo reads the real rows, and only as row volume. So it is a writing change.
  Decided: bring Sigma in where earned. Four pieces, all in the spec's Amendment section --
  provenance paragraph, engine section as a 3-step escalation, a NEW section "THE TABLES NOBODY
  WROTE" (own heading, after WHAT THIS MEANS FOR YOUR INDEXING STRATEGY), and the close's throughline.
  ACCURACY FIX, load-bearing: the draft's "Snowflake offers no B-tree secondary index" is now
  MISLEADING. Snowflake Optima Indexing creates HIDDEN indexes on standard tables, docs say
  "not user-declarable", best-effort, no config, no extra cost, Gen2/Adaptive warehouses only,
  detectable only in Query Profile. Precise claim: you cannot declare one; the engine may create
  one you cannot see. Spec outline item 3 corrected in place.
  Sigma finding for the new section: Sigma creates/manages a write-back schema (PostgreSQL 15+
  supported; materialization/input tables/write-back are ABSENT from Postgres's documented
  limitations list). Its materialization quickstart says, passive and actorless, "Materialized
  tables can be indexed or tuned for specific query patterns"; the best-practices page names four
  Sigma-side levers and never mentions the access path. SCOPE LIMIT, must stay in the text: this is
  a claim about DOCUMENTATION, not implementation -- proving what Sigma actually creates needs a
  paid Postgres connection we do not have.
  Length ceiling raised 14k -> ~15.5k deliberately, recorded in the spec; Task 10's wc -c uses the
  new number.
  Attribution wording: state WHERE the data came from, never what its licence permits. The terms
  were never verified and a licensing characterization must not be invented.
  Task 9 follow-on: indexing-sources.md needs new citation lines before any of this reaches the
  draft. The 30%->96% pruning figure is SNOWFLAKE'S published number -- attribute or omit.
  Throughline paragraph is BLOCKED ON TASK 19 by design: 19 tests instruction vs convention, which
  is the paragraph's subject. Do not draft it in advance of its own evidence.

TASK 19 COMPLETE (run): 12/12 sessions, all rc=0, finished 06:19. Clean single run; the 3
  discarded partials from 2026-08-02 were NOT mixed in. NOT YET GRADED against
  experiments/drift/EXPECTED.md — that is the next step, plus the count of sessions taking the
  rule's SECOND branch (stated why no index was needed) with one verbatim quote, compared to
  Task 18's same-harness Claude cell of 4/12.

PERSONAL DATA + DISCLOSURE FIX 2026-08-03 (user: "remove it", "do all 3"):
  1. LEAK, now redacted: the operator's personal address appeared in
     experiments/indexing/runs-crossmodel/claude/arm1-trial4/{result.json,transcript.txt},
     committed in 809975f which is ALREADY PUSHED to origin/indexing-article on the PUBLIC
     github.com/pdbethke/sigma-rbac-lab. Redacted to "[personal address redacted]"; result.json
     re-validated as JSON. The surrounding paragraph is deliberately KEPT — it is the evidence
     the hook fired. HISTORY NOT REWRITTEN: still present in 809975f, and per docs/HANDOFF.md a
     force-push does not erase (orphaned objects reachable by SHA, forks outlive it). Awaiting
     an explicit decision from the user before any force-push.
  2. DISCLOSURE WAS INCOMPLETE. Hooks live in ~/.claude/settings.json, NOT CLAUDE.md, so
     claude-md-at-time-of-run.txt covered only half the environment. New file
     experiments/indexing/hooks-at-time-of-run.md inventories hooks by event/matcher/effect
     WITHOUT reproducing their text — the SessionStart command contains the user's personal
     calendar ids AND a third party's business address, so pasting it publicly would re-create
     the leak just removed. experiments/indexing/README.md disclosure rewritten as two parts.
  3. CONFOUND recorded as caveat 3 in experiments/indexing/RESULTS.md. Traces in 9 of 144
     transcripts, some false positives ("calendar month" in app code). Assessed MILD and said so
     — a calendar instruction carries no indexing information — but NOT rated away.
     TASK 17 SCOPE CORRECTION: its isolation check was thorough about the `performance` skill and
     did not test hooks, which are a separate mechanism and did leak. Read that report as scoped
     to what it tested. Trials are NOT invalidated; the article must not imply they were.
  ARTICLE NOTE (in the spec, amendment 2026-08-03b): the check that was run looked exactly like
     the check that was needed. An untested mechanism and a tested-clean one are indistinguishable
     in a report that only lists what it found — the same shape as an absent index reading
     identically to a considered decision. Worth one sentence, aimed at the author.

NEXT AFTER 19: Task 12 charts for expansion/stripped/tiers (user wants charts before article),
  then Task 10 article rewrite (the "THEN I TOOK THE INDEXES AWAY" section currently states
  0/24 as the headline and must be reworded to the same-harness Task 15 vs 16 comparison),
  then Task 11 closeout.
