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
