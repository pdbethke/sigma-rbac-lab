# Public writing

Bodies as files, reasoning here. Kept in the repo so the claims made in public and the claims made in
`../VERIFY.md` can be checked against each other — a wrong number in a post is the same class of
error the rest of this repo exists to catch.

## The files

    tile.txt                              PUBLISHED   workbook title and gallery description
    01-rbac.txt                           PUBLISHED   who may write
    02-rules-as-data.txt                  PUBLISHED   what they may write
    03-containment.txt                    next        where the boundary lives
    04-competitive-intelligence-post.txt  after       the connecting post
    04-competitive-intelligence-article.txt  after     the article it points to
    05-corpus-supply-chain-post.txt       drafted    the connecting post
    05-corpus-supply-chain.txt            drafted    the article it points to
    indexing.txt                          drafted    STANDALONE — indexing as a fundamental you can now blow past
    indexing-sources.md                               every engine and vendor claim, cited or demonstrated
    personas.md                                       who is who, and which pair proves what
    held-back.md                                      ideas not yet spent

## Format, which is not a preference

**Everything is `.txt`. Posts and articles alike. Never Markdown.**

Markdown is a formatting language for a renderer that isn't there. Pasting it into LinkedIn carries
`**`, `#` and `>` through as literal characters, and indented or fenced blocks paste with their
leading whitespace. A post body is a deliverable to be copied, not a document to be rendered.

**RTF was tried for the long-form articles and abandoned.** The theory was reasonable — carry the
section headings across as real bold instead of re-applying them by hand. In practice LinkedIn's
article editor silently ate runs of roughly thirty characters out of the paste: *"assessing whether
the model seems sensible"* arrived as *"assessensible"*, *"something relevant, reads"* as
*"somethreats"*. The generated file was clean every time; the parser was not. Wrapping the RTF at 200
characters (readers have long assumed sub-255-character lines) was the right fix on paper and not
worth the risk on something that ships.

Plain text pastes clean. Apply the headings with the editor's own style control — it takes a minute
and nothing gets eaten.

The general lesson is worth keeping: **a silent, partial corruption is worse than a failed paste.**
Fused words like `weighedagainst` hide comfortably inside fluent prose, which is the same failure the
articles themselves are about.

**Bodies are unindented, one line per paragraph, no hard wraps.** If a body ever needs two short lines
together — a sign-off, a pair of links — separate them with a blank line, or an unwrapper will read
them as one paragraph and join them.

## Length

LinkedIn caps a native post at **3,000 characters**.

    wc -c docs/posts/*.txt

`03-containment.txt` sits at 2,304 after the rewrite, so there is room. Check after any edit.

`04` is an article plus a connecting post precisely because it wouldn't fit. When the character limit
starts deciding which parts of an argument survive, the format is wrong — the three things cut trying
to reach 3,000 were all load-bearing. Articles get materially less in-feed distribution than native
posts, so the connecting post has to be a complete argument rather than a teaser. A reader who never
clicks should still come away with something.

## Publication order, and a renumbering

**Numbering is publication order, and it changed during drafting.** What earlier notes called "post 3"
(competitive intelligence) is now `04`; what they called "post 4" (containment) is now `03`.

Containment goes first because it rides Sigma's announcement of agents outside the workbook, and that
has a clock on it. The competitive-intelligence piece has none, and lands harder on a reader who has
already accepted that corpus boundaries matter.

---

## Why each piece is shaped the way it is

### tile.txt

`Nothing is hidden, it is scoped` is the line doing the work. It tells a visitor what to look for, and
it is the distinction most people arrive without — the assumption being that access control means
things are concealed from you, rather than never assembled for you.

The title replaced "Test - Pls do not use - Multi-User/Role System Public debugging", which was the
page title, the browser tab and the link preview everywhere it got shared.

### 01-rbac.txt

Opens on the question rather than the artifact, because *can it build an RBAC* is the line a reader
remembers. The Priya/Kwame contrast is concrete and clickable before any abstraction arrives.

The gated-dropdown lesson sits in the middle deliberately — it's the takeaway that travels beyond
Sigma, and it's true of nearly every app the audience has shipped.

The assessment of Sigma is one plain sentence. Longer praise reads as sponsored; having published a
working thing on the platform carries more weight than adjectives would.

### 02-rules-as-data.txt

Stands alone for readers who missed the first, so no Priya/Kwame framing in the opening.

The load-bearing paragraph is the one about the hint. Anyone can move a regex into a table; the thing
worth stealing is that the human-readable format description and the machine-enforced rule are the
same row, so they cannot disagree.

The stacked-gates paragraph names Aaliyah and Kwame, not Mateo. See `personas.md` — this is the one
that shipped wrong in draft.

### 03-containment.txt

**Rewritten 2026-07-30 to change its posture.** The first draft close-read two phrases from Sigma's
announcement and talked about blast radius, compromise and "the cost is worth naming now" — incident
vocabulary aimed at a feature shipped days earlier. Even with self-criticism up front, the net read was
*here is what is wrong with what you just launched*, which is not a thing to publish a week after
posting that the platform passed.

The rewrite keeps every technical point and inverts the framing. External agents are **good news** for
this pattern: a governed model stops being somewhere you visit and becomes something your tools can
reach. The gate-stops-at-the-workbook problem becomes the author's own homework, which it genuinely
is — presentation-layer authorization was always a convenience. And the identity question becomes
curiosity about what to test next rather than a challenge the vendor has to answer.

The multiple-workbooks beat came out entirely. It was the most critical-sounding part and it is a
better post on its own terms, framed around what corralai's trust tiers do rather than around what
another product might not. See `held-back.md`.

**Admitting the test isn't run stays.** It closes on a specific falsifiable number, which invites
people back for the result and makes overclaiming impossible.

**Before publishing:** do not cite a test result that hasn't been run. Step 24 in `../BUILD_LOG.md`
describes the experiment — point an external agent at this workbook as Kwame and compare to 31,500.

### 04 — the connecting post and the article

Audience is **both** business analysts and builders, which is why the argument is in plain language up
front and the specifics arrive later. An analyst gets the point; a builder gets the receipts; nobody
has to read past what's useful to them. The collection vocabulary was deliberately de-jargoned —
selectors, actors and residential egress are gone — while Cortex, governed views and the warehouse
stayed, because those are the evidence the thing was actually built.

The concrete example is the corralai field note: pointing the audit gate at its own scorer and getting
a perfect score and a zero score in the same report, one impossible number over six faults. Published
at `corralai.dev/field-notes/a-judge-in-her-own-cause/`, so it's disclosable and already public.

It sits in the failure-mode section rather than in RUN IT BACKWARDS, where a placeholder originally
was. RUN IT BACKWARDS is about detecting your own emissions; this is about a fabricated value
surviving review. Different claims, and the second is the more useful slot — a self-critical example
from the author's own tooling carries more than a hypothetical about a competitor.

**The Assistant/agent section was added 2026-07-30**, placed directly after the corpus rules because
that is where a reader raises the obvious objection: why not just ask the built-in assistant?

**It makes no claim about what the assistant can or cannot do.** A first pass asserted that it is
edit-mode only, reads the draft, and is unreachable by viewers — all true of what was tested here on
Sigma Public, none of it safe to state flatly in public about someone else's product. Paid tiers have
viewer-facing natural-language features that are licence-gated, and their current reach is unknown to
us. So the section rests on one observation actually made — the assistant volunteering its own reach,
verbatim in `../FIELD_GUIDE.md` — and otherwise argues from the principle: an agent has a boundary, a
general assistant has access, and the error is asking the second and trusting it like the first.

Framed as *the mistake isn't using either one*, which keeps it a distinction rather than a complaint.

**The through-line worth using deliberately.** corralai certifies by execution and never accepts a
self-report. This repo computes expected answers in an independent SQL oracle and never trusts the
editor's own reading. Same principle in two domains — *nemo iudex in causa sua*.

---

### 05-corpus-supply-chain

Article, builder-facing. The piece where the two projects merge: the RBAC work supplies "scoping made
it correct", corralai supplies the worked answer.

Opens on **the temptation** — connecting one more source — because that is the reader's current
behaviour, so they are implicated by paragraph two rather than lectured from paragraph one. Then three
distinct harms, deliberately separated: security is listed first and dismissed as the least
interesting, because everyone already knows it and it isn't what costs them. Silent precedence is the
one nobody discusses. Unfalsifiability is the one that matters to anyone signing off.

**The load-bearing distinction is retrieved versus injected context.** Evidence versus authority.
Stored in the same place, in the same format, managed by the same process — which is the whole problem
in one sentence. corralai's tiering is the worked answer, and the promotion step is the design, not the
storage or the search.

**GIVE THE CORPUS A NAME was added 2026-07-30**, because the article raised a question it then walked
past: bounding a corpus sounds like discipline, and discipline does not survive a quarter. The section
answers it concretely — stop pointing agents at data, point them at a named governed view, which in
Sigma is an object with lineage that a person can open and read. Three consequences follow, and each
one closes a harm named earlier in the piece: precedence gets settled upstream, the corpus becomes
countable and therefore assertable against the SQL oracle, and scope varies by identity so the same
grounding resolves to 31,500 rows for a store manager and 94,500 for a regional director.

That last one is the strongest Sigma argument available and it is drawn straight from `../VERIFY.md`
rather than invented for the article.

**The developer-facing back half was cut on 2026-07-30.** The original closed with a section on agent
instruction files arriving with a cloned repository — genuinely the strongest builder material in the
set, and written at a completely different reader. It lost every non-technical person for the last
thousand words, and Sigma disappeared along with them. Moved whole to `held-back.md` as its own piece.

What replaced it keeps the same argument in the audience's own terms: **who is allowed to write to it.**
A shared drive anyone can drop a file into, a wiki page anyone can edit, a document a supplier emailed
over. The point lands harder, because it describes the reader's actual company rather than a
development workflow — and the review process it asks for is one they already have for policy changes.

The injection test survived the rewrite with the vocabulary changed: a wiki page or a supplier's file
rather than a repository's docs, and *watch whether the agent behaves differently* rather than *look at
what reached the instructions*.

**It ends with a test, not an opinion.** Plant an instruction in a retrievable-but-not-authoritative
document and see whether it reaches the instructions. That converts the whole argument from
architecture diagram to something an afternoon can settle, which is the corralai thesis applied to
itself.

**Still needed:** a real result from that test. If one has been run, it is the strongest paragraph
available and it belongs right after the test description.

### indexing.txt

**Standalone, outside the numbered series, and deliberately so.** The series is one argument told in
order — who may write, what they may write, where the boundary lives — and this piece is about a
different failure entirely: a fundamental that stopped failing loudly enough to teach anyone. It
shares the repo's data and none of its narrative, so numbering it would imply a sequence that isn't
there.

**The evidence was gathered before the article was written, and it kept refuting the plan.** That is
the reason to trust it and the reason it took so long. The original premise was that agents skip
indexing. They mostly don't — 8 of 10 sessions declared explicit indexes unprompted, and the scanner
found zero N+1 in any page-serving code across eleven codebases. Both planned sections had to be
rewritten to report what was actually there. A third premise, that lost context between sessions was
the mechanism, was falsified outright at 24 of 24.

**The finding that survived is better than the one that was planned.** It emerged from removing the
indexes from the starting schema and changing nothing else: 0 of 24. The model names the right index
in its own transcript and withholds it to match the surrounding convention. Deference, not
ignorance — which is why the title is *Your codebase is the prompt*.

**A control run exists because without it the headline number is meaningless.** A schema declaring
relations and zero indexes, compiled by the ORM, emits zero `CREATE INDEX` — verified on all three
major versions the trials installed. Without that, every index counted might have been the
framework's.

**The measurement error is in the article on purpose.** The first pass reported 14.0 rising to 18.2;
the true in-scope figures are 4.0 and 5.2, overstated about threefold by counting uniqueness
constraints the ORM emits mechanically and tables outside the experiment. It was internally
consistent, reproducible, and wrong. Cutting it would have made the piece cleaner and less true, and
it is the clearest instance of the thesis available — a plausible number rendering identically to a
correct one.

**A late claim audit caught three more.** "Roughly thirty" unindexed foreign keys was 15; "9 to 12"
was 9 to 11; "two of five trials were near zero" described trials that were 3 and 3. Recorded because
the pattern is the point: the numbers that survive scrutiny are the ones something independent went
and checked, and the first two had already been read several times by then.

**The scanner's false-positive rate is published alongside its findings.** 20 candidates, 13 true, 7
false, 35% — all seven from a single misclassification. A tool reported as perfect is not credible,
and "the scanner found nothing" and "there is nothing to find" are different claims.

**Two artifacts, two jobs, and the split is deliberate.** The ORM project is the corpus the N+1
scanner reads; raw SQL against SQLite and DuckDB is the instrument that measures indexes. Merging
them would have made one story about tooling and lost the engine argument entirely.

**The engine section is demonstrated rather than cited wherever it can be.** SQLite naming
`idx_inventory_store` and DuckDB producing a byte-identical plan before and after the equivalent
index are both committed outputs a reader can re-run in a minute. Only the warehouse claims rest on
vendor documentation, and each has a dated line in `indexing-sources.md`.

**⭐ Sigma is the vantage point, not the subject — and an earlier draft got that backwards.** The
first version built the whole "tables nobody wrote" section on Sigma's write-back schema. The author
challenged it: the audience is full-stack developers, and a BI platform most of them don't use was
carrying a general argument on its own. He was right, and the diagnosis was that the argument was
sound while the example wasn't. Generated schema is something that reader already lives in — ORM
migrations, auth-library tables, job queues, audit logs — and the strongest instance was already in
the piece, because the ORM emits `CREATE UNIQUE INDEX` mechanically from a uniqueness constraint,
which is the same generated DDL that produced the 14.0-that-was-4.0. Rewritten around those, with
Sigma demoted to one clause among several.

**The quote is attributed rather than anonymized.** A pass at "one vendor's materialization guide"
was worse: an unattributed quote can't be checked, and hiding the name reads as a dig you won't sign.
Naming it costs nothing once it's one instance among several instead of the whole section.

**The positioning paragraph exists because it's the honest origin.** A long-time full-stack developer
who has been working in Sigma recently is exactly the person who notices that a layer between you and
the database is a layer where the mechanism goes invisible — and agents are the newest such layer.
That framing arrived late, from the author, and it retroactively explains why the piece demonstrates
rather than cites wherever it can: EXPLAIN output, schema diffs, a scanner. Wanting the underlying
mechanism is the stance, so the evidence had to be mechanical.

**Where the data came from is stated; what its terms permit is not.** That was never verified, and
inventing a licensing characterization for a public repo is the kind of plausible-sounding claim this
piece is about.

**The generated-schema claims are scoped to documentation, not implementation.** Verifying what Sigma
actually creates in a Postgres write-back schema needs a paid connection this project doesn't have,
and the article says so in the text.

**The Snowflake claim was corrected before publication, not after.** An earlier draft said Snowflake
"offers no B-tree secondary index." Optima Indexing creates what the docs call hidden, "not
user-declarable" indexes on standard tables, which makes the flat version misleading even though
`CREATE INDEX` really is scoped to hybrid tables. The corrected version is sharper anyway: you cannot
declare one, and the engine may create one you cannot see.

**`0 of 24` is stated as harness-specific, because it is.** Through a smaller harness the absolute
zero does not replicate — 4 of 12, 12 of 12, 11 of 12 across three tools. The qualitative mechanism
does replicate. Letting the clean number stand unqualified would have been the most quotable sentence
in the piece and the least defensible.

**The hook disclosure is in the article, not just the repo.** A user-level `SessionStart` hook fired
inside trial sessions and the original disclosure named only `CLAUDE.md`, because hooks live in a
different file. It is mild and the trials stand. It is in the text because the shape of the error is
the subject: the isolation check that was run was thorough, tested the mechanism its author thought
of, and came back clean — and a mechanism nobody tests looks exactly like one that tests clean.

**It is 20,573 characters against the series' 11–14k.** Raised deliberately and twice, with the
reason recorded in the spec. The band came from pieces that argue from reasoning; this one reports
five experiments and 144 graded sessions.

## Accuracy constraints

Claims deliberately weakened, and why. Each is a place where the stronger version would have been the
kind of overclaim the rest of this repo exists to avoid.

**"What leaves is the answer" — not "the data never leaves your warehouse."** Warehouse-native is
entirely true of Sigma's processing model; no extracts, computation pushed down. But the moment any
agent reads results into a model's context, that is egress. The unqualified version is the one a
security reader spots immediately.

**The published demo has no warehouse behind it, and the free tier is not the recommendation.** Sigma
Public uses file uploads. The demo proves that scope can be expressed as data, which is
tier-independent and is the claim being made — nothing more. An earlier draft mentioned the free tier
in a way that read as an invitation to build on it, which is both off-message and technically wrong:
writable tables backed by the warehouse, a queryable history, and boundaries as governed views are all
subscription features, and the method depends on every one of them. Say which side of that line any
given claim sits on.

**Three inference locations, not two.** In-warehouse, platform-mediated, third-party assistant.
Collapsing these into "local versus cloud" loses the middle case, which is the one most Sigma users
are actually in.

**Verify before publishing:** which models are available in-region for Cortex and whether cross-region
processing is enabled; and Sigma's current published data-handling terms for their own agent, so the
middle tier is described the way they describe it.

## Still open

**The framing decision on `04`.** The competitor pipeline is a **design**, not a report. corralai is an
audit gate for code, not competitive intelligence, so no engagement of this shape has been run. A few
sentences still read as description of something operating — "in this design that is where the
competitor corpus goes" is the clearest. Either move those to the conditional, or don't publish until
it has been run once.

The middle position is the one thing the piece cannot survive, because it is precisely the failure it
warns about: present tense with nothing behind it, reading identically to a report.

**Cortex regional availability**, per the constraint above.

**The article's title line** is emitted as a normal paragraph rather than bold. Most article editors
have a separate title field, so this is usually moot — check where it's being pasted.
