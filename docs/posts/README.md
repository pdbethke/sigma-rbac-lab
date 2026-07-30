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
    04-competitive-intelligence-article.rtf  after    the article it points to
    tortf.py                                          .txt -> .rtf, generated never hand-edited
    personas.md                                       who is who, and which pair proves what
    held-back.md                                      ideas not yet spent

## Formats, which are not preferences

**Short native posts are `.txt`. Long-form articles are `.rtf`. Never Markdown.**

Markdown is a formatting language for a renderer that isn't there. Pasting it into LinkedIn carries
`**`, `#` and `>` through as literal characters, and indented or fenced blocks paste with their
leading whitespace. A post body is a deliverable to be copied, not a document to be rendered.

`.txt` is the editable source in every case. The `.rtf` is generated so section headings survive the
paste into an article editor:

    python3 docs/posts/tortf.py docs/posts/04-competitive-intelligence-article.txt \
        -o docs/posts/04-competitive-intelligence-article.rtf

Never hand-edit the RTF. The escaping is exactly the part a human gets wrong — these bodies are full
of em dashes and curly quotes, and a byte-for-byte copy mangles them silently.

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
that is where a reader raises the obvious objection: why not just ask the built-in assistant? The
answer matters to the whole method — Sigma's Assistant is an authoring tool with broad reach across the
model by design, and it reads the draft rather than what colleagues see. Ask it competitor questions
and the corpus discipline evaporates, because it can see everything you have. Framed as *the mistake
isn't using either one, it's using the author's tool where you meant the bounded one* — which keeps it
a distinction rather than a complaint. Evidence is in `../FIELD_GUIDE.md`: ours volunteered its own
reach unprompted, offering to query across departments, users, roles, permissions, assignments,
resources and scopes.

**The through-line worth using deliberately.** corralai certifies by execution and never accepts a
self-report. This repo computes expected answers in an independent SQL oracle and never trusts the
editor's own reading. Same principle in two domains — *nemo iudex in causa sua*.

---

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
