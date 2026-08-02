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

    experiments/indexing/           NEW   index-count test: prompts, raw transcripts, tally
    app/                            NEW   generated application layer, part of the demo project
    .claude/skills/performance/     NEW   the N+1 scanner skill
    .claude/settings.json           EDIT  SessionStart hook, matchers startup + compact
    docs/posts/indexing.txt         NEW   the article
    docs/posts/README.md            EDIT  a section on why this piece is shaped the way it is

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
- Detection is **static and ORM-aware**, deliberately not clever: a query call inside a loop or
  comprehension, a related-object access on a queryset without `select_related` / `prefetch_related`,
  serializers reaching across relations. It reports candidates with `file:line` and what would fix
  each. It does **not** attempt to prove an N+1 at runtime. Flagging for a human is the honest scope;
  overreach is what gets scanners turned off.

The hook:

- `.claude/settings.json`, one `SessionStart` hook with matchers `startup` and `compact`.
- `compact` is the load-bearing one. After a compaction, the specific reasoning — "we decided to
  prefetch here" — is exactly what is gone, so re-running the scan rebuilds state the context window
  dropped.
- **Claude Code has no `PostCompact` hook.** The post-compaction hook is `SessionStart` with matcher
  `compact`. `PreCompact` exists but fires before, when a re-scan is least useful. A reader who copies
  a `PostCompact` block gets silence rather than an error, so the name must be exact.

## The article

Outline:

1. Open on the line — *old school in an age of new school* — then undercut it immediately: the old
   school is not nostalgia, it is the part that stopped failing loudly enough to teach anyone.
2. What an index is, in one honest paragraph: a claim about how the data will be read, paid for in
   writes and in storage. Not "makes queries fast."
3. Why some engines have them and some do not. A row store seeking one row versus a columnar engine
   scanning a column. This same schema, in Snowflake behind Sigma, has no B-tree indexes at all —
   micro-partitions and zone maps. The lesson: "add an index" is not portable advice, it is
   engine-specific.
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

Length: article scale. `04` and `05` sit at 11–14k characters. A connecting post may follow if it
earns one; not designed here.

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
