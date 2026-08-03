# Indexing in an age of agentic development — design

Date: 2026-08-02
Status: approved, not yet built

## What this is

A standalone article for `docs/posts/`, outside the numbered series, plus the evidence work it is
written from. The article argues that database indexing is a fundamental you can now blow past
without anything failing loudly, and that the fix is a mechanized re-scan rather than a resolution to
be more careful.

## Placement

Standalone in `docs/posts/`, not numbered. The numbered series is anchored to claims this repo can
check against `../VERIFY.md`; a general indexing article has no such spine, and forcing a hook back
to the RBAC lab would be the kind of stretched claim the repo exists to prevent.

It inherits the format rules and accuracy discipline of `docs/posts/README.md` regardless: `.txt`,
never Markdown, unindented, one line per paragraph, no hard wraps, US spelling.

## The claim

The spine: **the agent writes code that runs, not code that scales.**

The reason it matters: correctness and scalability used to fail together. You learned indexing
because your application fell over on a dataset you could feel, early, on your own machine, attached
to the query that caused it. Agent-written code clears the bar that used to trigger that lesson — it
returns the right rows. The N+1 does not announce itself at 200 rows in development; it announces
itself at 200,000 rows in production, detached from the moment anyone could have learned from it.

So the claim is not that agents are careless. It is that the feedback loop that taught the
fundamental has been removed, and everything that lived in that gap is now unenforced.

The second beat: agents build schema and they build queries, and we trust that they build indexes.
**An omitted index is invisible.** A missing table is a crash. A wrong query returns wrong rows. An
absent index returns the correct rows, slowly, and its absence renders identically to a deliberate
decision not to index. That is the same failure class as the wrong persona in `02` and the 31,500
attribution in `05` — both caught only because something independent was computed and compared.

## Deliverables, in dependency order

    package.json                    NEW   root Node project: vitest, prisma, the TS parser
    experiments/indexing/           NEW   index-count test: prompts, raw transcripts, tally
    app/                            NEW   generated Prisma application, part of the demo project
    .claude/skills/performance/     NEW   the N+1 scanner skill
    .claude/settings.json           EDIT  SessionStart hook, matchers startup + compact
    docs/posts/indexing.txt         NEW   the article
    docs/posts/README.md            EDIT  a section on why this piece is shaped the way it is

**Stack: Prisma and TypeScript, not Python.** The premise of the article is a claim about what is
being shipped now, and what is being shipped now is TypeScript against Prisma. A Python corpus would
make the piece a thought experiment about where the problem is not. Three concrete gains follow:
Prisma indexes are declarative, so `@@index([storeId, snapshotDate])` is a line the agent either
wrote or did not and nothing has to be inferred from ORM convention; `prisma migrate diff` emits real
`CREATE INDEX` DDL in one command with no application boot; and the N+1 shape — an awaited query
inside a `map`, or a relation read without `include` — is the canonical one of this era.

The cost is Node and npm entering a repository that is stdlib Python today. `oracle/` stays Python and
untouched. All new code is TypeScript under one root `package.json` with vitest as the only test
runner, so the repo does not carry two test stacks.

**DuckDB does two jobs.** As the metrics store, every graded trial is written to
`experiments/indexing/metrics.duckdb`, so the numbers in the article come out of a query anyone can
re-run rather than out of a table a human transcribed — the same discipline the SQL oracle applies to
the row counts.

As an engine, it is the article's strongest example, and it replaces a citation with a demonstration.
Section 3 argues that "add an index" is engine-specific advice. Rather than resting that on
Snowflake's documentation, the same rows are loaded into SQLite and into DuckDB and both are asked to
`EXPLAIN` the same query: one embedded row store, one embedded columnar engine, checkable on a laptop
in under a minute.

**The claim has to be the narrow one.** DuckDB *does* support `CREATE INDEX`; it builds ART indexes
and uses them for point lookups and constraint enforcement. The defensible statement is that for the
analytical scan this schema invites, DuckDB relies on automatic zone maps and the index often buys
nothing, while SQLite's plan for the same query names `idx_inventory_store`. That is measured, not
asserted, and the measured output is committed.

The article is written **last**, from what the first four produce. If the tests come back boring —
agents index correctly, the scanner finds nothing — that is a result, and the article says so. It
does not get quietly reframed until the thesis survives.

## Evidence 1 — the index-count test

The question: given this schema's domain and a set of queries, does an agent produce the indexes a
human who knew the access pattern produced?

There is already an oracle. `oracle/schema.sql` declares 17 tables and exactly 4 indexes:

    idx_assignments_user   (user_id, status)
    idx_permissions_role   (role_id)
    idx_inventory_store    (store_id, snapshot_date)
    idx_adj_store          (store_id, product_id)

Three are composite and the column order encodes the access pattern: `status` is present because
assignments are filtered to active, and `snapshot_date` trails `store_id` because a store's inventory
is read as a time range. Roughly thirty other `REFERENCES` columns are left unindexed on purpose.

**A control has to run before any trial.** Prisma's behavior on relation fields is the confound: if
it emitted indexes for relation scalars on its own, every trial would be graded against work the
agent did not do. So a hand-written schema carrying zero `@@index` declarations is compiled through
`prisma migrate diff` first, and the DDL is checked for `CREATE INDEX`. Whatever it shows is recorded
before the trials run, and it is stated in the article.

Method:

- **Domain** is the lab's own inventory model, described in business terms only. No performance
  vocabulary anywhere in the prompt.
- **Fresh sessions**, no project CLAUDE.md and no memory, so the test measures the default rather
  than this workspace's configuration.
- **Two arms**: (1) build the schema and these queries; (2) the same, plus "this will run in
  production." If the trust is warranted, arm 1 already indexes. If it takes the nudge, that gap is
  the finding.
- **Five trials per arm.** One run is an anecdote. Five supports "n of 5," which is honest about
  being small.
- **Raw transcripts committed** alongside the tally, so the count is checkable the way the row counts
  are.

Graded outcomes, all of which are publishable:

- indexes every foreign key — the diligent-looking wrong answer, and the most likely one
- indexes nothing
- right columns, single-column instead of composite — `(store_id)` alone does not serve the date range
- composite, wrong column order

The last two are the strongest material, because they make the actual point: an index is a claim
about how the data will be read, and nobody told the agent how it will be read. It is not a checklist
item that was skipped. It is a judgment requiring context the agent never had.

## Evidence 2 — the scanner and its corpus

This repo has no application code today: data, an oracle, and docs. The corpus is therefore
generated — **the application the agent writes becomes part of the demo project**, not a discarded
experiment artifact. The lab grows an application layer that reads through the same scopes, which is
consistent with its template intent, and the scanner gets a permanent corpus.

The loop closes: evidence 1 asks whether it created the indexes; evidence 2 points the scanner at the
result and asks what it left in the query layer. Fully disclosable, no production code quoted, and a
reader can reproduce both from fixtures that ship in the repo.

The skill:

- `.claude/skills/performance/SKILL.md` — triggers on an explicit scan and on work touching ORM query
  code. It goes under `.claude/skills/` rather than following the existing `skills/sigma-public/`
  convention at the repo root: that directory holds a skill authored for publication, whereas this one
  has to actually load in this project in order for any claim about it to be verifiable.
- Detection is **static and ORM-aware**, deliberately not clever, and written in TypeScript because
  the corpus is: an awaited Prisma query inside a loop or inside a `map` / `forEach` callback, and a
  relation read on a record fetched without a matching `include` or `select`. It reports candidates
  with `file:line` and what would fix each. It does **not** attempt to prove an N+1 at runtime.
  Flagging for a human is the honest scope; overreach is what gets scanners turned off.
- Parsing uses `@typescript-eslint/typescript-estree`. The scanner is unit-tested rule by rule under
  vitest, so every claim the article makes about what it catches is backed by a test.

The hook:

- `.claude/settings.json`, one `SessionStart` hook with matchers `startup` and `compact`.
- `compact` is the load-bearing one. After a compaction, the specific reasoning — "we decided to
  prefetch here" — is exactly what is gone, so re-running the scan rebuilds state the context window
  dropped.
- **Correction (verified against Claude Code 2.1.220, see `docs/hook-verification.md`): `PostCompact`
  does exist as its own hook event** — it fires after a compaction completes and cannot block
  (exit code ignored). The article's original claim that no such event exists was wrong. What
  remains true, and what this repo's hook actually uses, is that `SessionStart` also accepts a
  `compact` matcher, and that is the one wired here — chosen because it re-enters the same
  SessionStart plumbing (additionalContext) already used for `startup`, rather than because
  `PostCompact` doesn't exist. `PreCompact` also exists, firing before compaction, which is too
  early for a re-scan. A reader who copies a `PostCompact` block will NOT get silence — it is a
  real, working event name — but it is not the one this article's hook configuration uses.

## The article

Outline:

1. Open on the line — *old school in an age of new school* — then undercut it immediately: the old
   school is not nostalgia, it is the part that stopped failing loudly enough to teach anyone.
2. What an index is, in one honest paragraph: a claim about how the data will be read, paid for in
   writes and in storage. Not "makes queries fast."
3. Why some engines have them and some do not — a three-step escalation, each step moving the
   decision further from the person writing the query. SQLite declares an index and the plan names
   it. DuckDB declares one and the optimizer ignores it for an analytical scan. Snowflake standard
   tables cannot declare one at all, and Optima Indexing may build a hidden one by watching the
   workload. The lesson: "add an index" is not portable advice, it is engine-specific.
   **Corrected 2026-08-03:** this item previously read "in Snowflake behind Sigma, has no B-tree
   indexes at all." That is now misleading — see the amendment below.
4. The gap that used to teach you. Correctness and scalability failed together, on your machine. They
   do not any more.
5. We trust they build indexes. The omitted index is invisible. Then the finding: four hand-authored
   indexes versus what the agent produced.
6. N+1, concretely. The four-deep chain `products → product_lines → product_families → product_types`
   plus `→ brands`, against `My Inventory`'s 31,500 rows for a store manager, and the query-per-row.
7. The fix is a hook, not a resolution. The performance skill, `SessionStart` on `startup` and
   `compact`, and what the scanner caught.
8. Close on the two tests a reader can run this afternoon.

The phrase *old school in an age of new school* is the opening line, not the title. The series titles
carry the claim rather than the mood; this piece's stakes are its strongest asset and the title should
carry them.

Length: article scale. `04` and `05` sit at 11–14k characters. **Ceiling raised to ~15.5k on
2026-08-03**, deliberately and with the reason recorded: the provenance paragraph and the new
"THE TABLES NOBODY WROTE" section add roughly 1,800 characters to a draft already at 13,748. The
piece earned the length by measuring things rather than by padding. Task 10's `wc -c` check compares
against the new ceiling, not the old one. A connecting post may follow if it earns one; not designed
here.

## Accuracy constraints

- **No unrun claims.** If the scanner has not caught something, the article does not say it did. This
  is the failure flagged as still open against `04` in `docs/posts/README.md`: present tense with
  nothing behind it reads identically to a report.
- **Sample size stated in the text.** "n of 5," never "agents tend to."
- **Hook names and matchers verified by firing them and observing the result**, not recalled.
- **Snowflake and Sigma storage claims** checked against current published documentation before
  publishing, and phrased as what that engine does rather than as a general claim about columnar
  databases.
- **Prompts, trial count, and raw transcripts committed**, so every number in the piece is checkable.
- **US spelling**, `.txt`, unindented, one paragraph per line, no hard wraps. Check `wc -c` after
  edits.

## Out of scope

- A connecting LinkedIn post. Decide after the article exists.
- Any change to the numbered series.
- Runtime N+1 detection, query profiling, or a benchmark harness.
- Any claim about tools not built here beyond the shape of the question, per the hedging discipline
  applied to the Assistant material in `04`.

---

## Amendment 2026-08-03 — the Sigma and Snowflake material

The problem this solves: the article is not about Sigma, but every artifact it ships sits in a
repo named `sigma-rbac-lab`, built on Sigma's sample retail data. The domain read as an unexplained
coincidence. Decided: bring Sigma in where it is earned rather than swapping the data or apologizing
for it. **No measurement changes.** Checked first, and it is what made this cheap:

| | Sigma data present? |
|---|---|
| Trial prompts (both arms, all drift prompts) | **no** — generic entity and field lists we authored |
| Generated corpora (`app/`, every trial) | **no** |
| Article draft | **no** — "retail inventory", `inventory_daily`, `store_id` |
| Task 9 engine demo | **yes** — `oracle/rbac.db` and `data/inventory_daily.csv`, 94,500 rows |

One measurement out of everything, and there only as row volume and column distribution — never as
values a reader sees. So this is a writing-and-citation change; nothing re-runs.

### 1. Provenance paragraph (section 2)

Three sentences after the reference-schema lines: the schema comes from the sibling RBAC lab built on
Sigma's free tier over their sample retail dataset; the four indexes are hand-authored, not
inherited; the nine RBAC tables are out of scope for the trials, which is why the comparison is
against two indexes rather than four. This answers "why retail inventory" and discloses the borrowed
rows in the same breath.

**State where the data came from, not what its licence permits.** Describing the source is a fact we
can stand behind; characterizing the terms is not, and was never verified. If a formal attribution or
licence note is wanted, that is a separate addition made deliberately.

### 2. Engine section — three steps, and an accuracy fix

Each step moves the index decision further from the person writing the query:

| | Can you declare it? | What the engine does |
|---|---|---|
| SQLite | yes | plan names `idx_inventory_store` — **demonstrated** |
| DuckDB | yes | plan byte-identical before and after — **demonstrated** |
| Snowflake standard tables | **no** | Optima may build a hidden one — **cited** |

**The accuracy fix.** The draft says Snowflake "offers no B-tree secondary index." Against the
`CREATE INDEX` page that is still literally defensible — that page is scoped to hybrid tables — but
it is now misleading, and a Snowflake-literate reader will say so. The precise claim: *on a standard
table you cannot declare an index, and the engine may create one you cannot see.*

Optima Indexing "automatically analyzes workload patterns", creates **hidden indexes** the docs call
**"not user-declarable"**, "built and maintained on a best-effort basis, without requiring user
intervention", at no additional cost and with no configuration, on Gen2 standard warehouses or
Adaptive Warehouses. Detectable only via the Query Profile insight "Snowflake Optima used" or the
"Partitions pruned by Snowflake Optima" statistic.

Optima stays in this section rather than moving to the new one: it is a fact about what the engine
does with an index, not about who owns the decision.

### 3. New section — "THE TABLES NOBODY WROTE"

Placed **after** "WHAT THIS MEANS FOR YOUR INDEXING STRATEGY", before "HORSEPOWER IS A COSTLY
NON-SOLUTION". Placement is load-bearing: among the platform material early on it reads as trivia;
after the reader has absorbed the measured finding it lands as an extension of something proven —
*it isn't only the code; tools write the tables now too.*

The argument: generated **schema** has the same problem as generated code. Sigma is the worked
example — a write-back schema it creates and manages (PostgreSQL 15+ supported, and materialization,
input tables and write-back are absent from PostgreSQL's documented limitations list, which is
specific enough that the omission is meaningful). Then their own sentence, quoted verbatim:

> "Query optimization: Materialized tables can be indexed or tuned for specific query patterns."

Passive, no actor, filed under *advantages*. The performance best-practices page names four
Sigma-side levers — denormalize upstream, materialize, hide columns, join in Sigma — and never
mentions the access path on the tables Sigma just wrote. The nearest owner named anywhere is "a data
specialist in your organization."

Closing move: Optima recalled as the mirror image. One platform hides the index it created, the
other hides the absence of one. Both leave the developer unable to tell whether a judgment was made —
which is the article's own finding, arriving through products instead of through agents.

**Register.** The passive-voice observation is quoted verbatim so a reader can check it, and aimed
at the pattern rather than at Sigma. The piece implicates the reader everywhere else; one
vendor-pointed jab would change its register.

**Scope limits, both stated in the text:**

- **Documentation, not implementation.** Absence of guidance is not absence of behavior. We cannot
  say Sigma creates no index on a Postgres write-back table — only that its guidance does not
  address it. Proving otherwise needs a paid Postgres connection and a look at the write-back
  schema; the free tier uploads files and has no warehouse behind it.
- **Row stores only.** On Snowflake — Sigma's primary platform — this barely matters, because a
  standard table has no declarable index anyway and clustering is the lever, which Sigma does point
  at. The gap is specific to the row stores.

### 4. Throughline in the close

The RBAC piece argued authority belongs in the data, not in the instruction. This one finds the model
conforming to what the codebase already did. Same argument from the other side — the codebase is data
the model reads, which is what the title means.

**Written after Task 19 resolves.** Task 19 tests exactly this: one CLAUDE.md rule against codebase
convention. If instruction wins, the paragraph is written differently. It must not be drafted in
advance of its own evidence.

### 5. `docs/posts/indexing-sources.md` amendment

Per the existing rule — no claim appears in the article without a line here — new entries needed for:

- Snowflake Optima: both URLs, date checked, exact wording, plus the Gen2/Adaptive gating,
  best-effort qualifier, no-additional-cost statement, and Query-Profile-only detection.
- Sigma write-back on PostgreSQL: write access "Necessary for features like Input tables and
  Materialization", PostgreSQL 15+, the reserved write schema, and the absence of these features
  from the documented PostgreSQL limitations list.
- The materialization quickstart's passive sentence, verbatim.
- The best-practices page's four levers and its silence on indexing.

**The 30%→96% pruning improvement is Snowflake's own published figure, not ours.** The no-unbenchmarked-
numbers constraint means it is attributed explicitly to Snowflake or it does not appear.

### 6. Repo README

One disclosure line naming the data source, so the public repo is not silently shipping derived
vendor rows under `data/`.

### Added accuracy constraints

- **Snowflake index claims are tier- and table-type-scoped.** "No secondary index" is false as a
  blanket statement: hybrid tables have `CREATE INDEX`, standard tables have search optimization and
  Optima. Say which table type, every time.
- **Vendor-published performance figures are attributed to the vendor or omitted.** They were not
  measured here and the piece's credibility rests on that distinction.
- **Claims about a product's behavior derived from its documentation are labelled as such** in the
  text, not just in the sources file.
