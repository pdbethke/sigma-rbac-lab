# Public writing

What was published alongside the demo, and the reasoning behind the choices. Kept in the repo so the
claims made in public and the claims made in `VERIFY.md` can be checked against each other.

Every persona detail below is checkable against `expected/` — see the note at the bottom, which is
there because one of these posts shipped a wrong one in draft.

---

## The tile

**Title:** `RBAC Lab: application-level access control in Sigma`

**Description:**

    A working demonstration of application-level role-based access control, built entirely in Sigma.
    Use the identity switcher to act as any of five users and watch the app change around you: the
    navigation, the inventory rows, the store options in the entry form, and what the AI assistant is
    able to answer. Nothing is hidden from anyone. Each identity's data is scoped, so what you cannot
    see was never in the result set. Every count is verified against an independent SQL model.

Short form, where the tile truncates:

    Application-level role-based access control, built in Sigma. Switch identities and watch the
    navigation, the data, the form options and the AI assistant all change. Nothing is hidden, it is
    scoped.

`Nothing is hidden, it is scoped` is the line doing the work. It tells a visitor what to look for,
and it is the distinction most people arrive without.

---

## Post 1 — the RBAC post

Opens on the question rather than the artifact, because *can it build an RBAC* is the line a reader
remembers. The Priya/Kwame contrast is concrete and clickable before any abstraction arrives. The
gated-dropdown lesson sits in the middle as the takeaway that travels beyond Sigma — it is true of
nearly every app the audience has shipped.

The assessment of Sigma is one plain sentence, deliberately. Longer praise reads as sponsored; having
published a working thing on the platform carries more weight than adjectives would.

    Thirty years of building multi-user systems has left me with one question I ask
    of every new platform: can it build an RBAC?

    It's a good test, because role-based access control exercises everything at once.
    A data model that expresses many-to-many honestly. Joins that behave predictably
    when a foreign key is null. Somewhere to hold identity, and a way to resolve it
    into effective permissions. Writes, and a story about who may make them. And a UI
    that reflects authority without being the authority.

    So I built one on Sigma, and published it.

    Open it and act as Priya. She sees three stores. Switch to Kwame and the same
    page, running the same formula, shows one. There is no filter on screen to
    explain the difference. Nothing was hidden from him. The rows were never in his
    result set.

    The part I'd point out to anyone building this kind of thing is smaller than
    that, and easier to get wrong. The store dropdown on the entry form offers only
    the stores you are allowed to write to. Not validated on submit, gated at the
    point of offer, so an illegal choice is never representable.

    That distinction matters more than it looks. A dropdown that lists three stores
    to someone who may only touch one has already disclosed the other two. Most
    authorization work I've reviewed guards the result set and leaves the option
    lists wide open.

    What makes this an application-level model rather than a platform feature: Sigma
    knows nothing about it. My roles, my scopes, my grant semantics. The same tables
    run unchanged in SQLite, and that SQL model computes the expected answer for
    every count in the app, independently.

    Sigma passed, and the exercise left me confident in the platform.

    It's a demo, not a product. The build log, the SQL oracle and a Flask-to-Sigma
    translation guide are all in the repo.

    Workbook: <public URL>
    Code: github.com/pdbethke/sigma-rbac-lab

    #RBAC #DataGovernance #AnalyticsEngineering #SigmaComputing

---

## Post 2 — rules as data

Stands alone for readers who missed the first, so no Priya/Kwame framing in the opening. The
load-bearing paragraph is the one about the hint: anyone can move a regex into a table, but the thing
worth stealing is that the human-readable format description and the machine-enforced rule are one
row, so they cannot disagree.

    Every validation you hardcode is a deploy waiting to happen.

    The last post was about who may write. This one is about what they may write.

    The entry form in my Sigma RBAC demo takes a serial number. Serial formats vary
    by brand, and some product lines override their brand's format. That is the kind
    of requirement that usually ends up as a regex in application code, which means
    every new brand is a pull request, a review and a release.

    So I put the patterns in the data instead. Brands carry a serial pattern. Product
    lines carry one too, and when both exist the more specific wins. Resolution is a
    single COALESCE: line first, then brand. Adding a rule for a new brand is
    inserting a row.

    Two details turned out to matter more than the pattern matching.

    The first is that an empty pattern is not a missing rule. It is the absence of a
    constraint, and I had to decide that deliberately rather than let a null decide
    it for me. Products exist that no one has written a format for yet, and the right
    behaviour is to accept anything, not to block the user out of a rule that was
    never authored.

    The second is the one I'd keep. The hint shown under the field lives in the same
    row as the pattern that enforces it. Change the rule and the help text changes
    with it, because they are the same fact. Documentation cannot drift from
    enforcement when there is only one of them.

    Worth naming what stacks up by the time someone hits submit. Whether you may post
    at all is one question, answered by your grant. Aaliyah reads every row of her
    store and can post nothing. Which store you may post to is a second, answered by
    a dropdown that offers only your own, so an illegal choice is never
    representable. Kwame stands in the same store as Aaliyah, reads the same 31,500
    rows, and differs from her in one boolean, and even he can only choose Abilene.
    Whether the serial is well formed is the third. Three independent questions, none
    of them answered by hiding a button.

    A SQL model checks every stored serial against its resolved pattern
    independently. That check has been made to fail on purpose, so an empty result
    means it works rather than that it was never exercised.

    Code: github.com/pdbethke/sigma-rbac-lab

    #DataModeling #DataQuality #AnalyticsEngineering #SigmaComputing

---

## Check the personas before publishing

The stacked-gates paragraph above originally named **Mateo** as the contrast to Aaliyah. It is
**Kwame**. Mateo is a different store entirely, so the comparison did not hold:

    Aaliyah Kowalski   Abilene    31,500 rows   can_edit 0   posts nothing
    Kwame Bianchi      Abilene    31,500 rows   can_edit 1   Abilene only
    Mateo Boateng      Alhambra   31,500 rows   can_edit 1   Alhambra only

Aaliyah and Kwame are the pair for demonstrating **read versus write**: same store, same row count,
one boolean apart. Mateo is the pair for demonstrating **scope**: identical counts to Kwame,
entirely different rows — *count proves scoping is happening; only the store name proves it is the
right scoping*. Two different arguments; do not mix them.

The fixtures are the source of truth. `expected/write_authority.csv` and
`expected/store_options.csv` answer who may post and where in two lines, and
`expected/verification_matrix.csv` has the row counts. A wrong persona in a public post is the same
class of error the whole repo exists to guard against — a plausible claim, unchecked, that renders
identically to a true one.

---

## Held back

One good post a week beats a thesis nobody finishes. Still unspent:

- **The agent scoped by absence** — it never declined anything; the rows were not there. The ❌ cover
  / ✅ control framing in `FIELD_GUIDE.md` is the whole argument in two lines.
- **Sentinels over nulls** — `ALL SCOPES` and `NO SCOPES` as real rows, because intent should be
  stated rather than inferred from an absence.
- **Global has to mean all** — why enumerating a global grant as three store grants breaks the
  moment a fourth store arrives. Step 23.

---

## Post 3 — adversarial agents as competitive intelligence

Drafted 2026-07-30, prompted by Sigma's announcement of agents that run outside the workbook
(API and MCP, usable from Claude or Codex). Not yet published.

**Published as an article with a connecting post, not as a single post.** The native-post version came
in at 3,043 characters against LinkedIn's 3,000 limit, and the three things cut to reach that were all
load-bearing: the counterfactual beat, the honest note that the public demo runs on the free tier, and
the inference-location framing. When the character limit starts deciding the argument, the format is
wrong.

The tradeoff is real and worth stating: LinkedIn articles get materially less in-feed distribution than
native posts. So the connecting post has to be a complete argument rather than a teaser — a reader who
never clicks should still come away with something.

### The connecting post

```
Most people who simulate a competitor with AI give it everything they know.
That's why it tells them nothing.

An agent grounded on your internals just reasons like you with a different logo
on. Ground it only on what an outside analyst could actually assemble about you
and the constraint stops being a limitation. It becomes the experiment: not what
would they do, but what can they conclude.

Then run it backwards, which is where it earns its keep. Point the same scrapers
at yourself and what comes back is your own observable surface, exactly as an
outsider assembles it. Not a guess about what you're leaking. A capture of it.
Five Rust job postings announce a rewrite. A quietly retired pricing tier
announces a segment exit. A support-doc edit announces a deprecation before your
roadmap does.

The failure mode is worth more attention than the technique. A changed selector
returns zero rows, zero rows doesn't raise an error, and the agent confidently
narrates a hiring freeze that is actually a CSS change. Its only artifact is
absence, which makes it the hardest thing to catch by looking.

I wrote up the whole method — the scraping stack, why the corpus lives in the
warehouse, what the external agent is and isn't allowed to see, and the checks
that keep it from generating strategy memos.

#CompetitiveIntelligence #AIAgents #RedTeaming #DataStrategy
```

### The article

**Build your competitor as an agent — then find out what you told them**

```
Most people who simulate a competitor with AI give it everything they know. That's
why it tells them nothing.

An agent grounded on your own internals reasons like you with a different logo on.
It has your assumptions, your numbers, your read on the market, and it hands them
back with the confidence of an outside opinion. You've built a mirror and called it
intelligence.

The useful version inverts the constraint. Ground the agent only on what an outside
analyst could actually assemble about you — and nothing else. The limitation is the
instrument. You stop asking what a competitor would do, which nobody can know, and
start asking what a competitor can conclude, which is a question with a checkable
answer.


THE CORPUS IS THE METHOD

Everything that determines whether this works happens before the model is involved.
An agent's conclusions are a function of what it was given, so the corpus is the
experiment and the prompt is close to irrelevant. Most of the effort in this field
goes into the instructions, and the corpus is the part that decides.

Which means the discipline is source selection. What could a competent analyst at a
competitor actually assemble about you? Public filings. Your pricing page. Job
postings. Release notes and changelogs. Support documentation. The GitHub org.
Conference talks. Review sites. Anything else is contamination, because the moment
the corpus contains something only an insider could know, the output stops being a
model of an adversary and becomes a model of you.


HOW IT'S ACTUALLY BUILT

Apify actors on a schedule handle the structured sources — job boards, changelogs,
review sites. Bright Data covers what needs residential egress, and that matters
more than it sounds. Pricing pages that vary by region only reveal that if you can
request them from those regions. A competitor's US and EU price points diverging is
a segmentation decision you can read months before anyone announces it, and you
cannot see it at all from a single datacenter IP.

Each run appends to a table rather than overwriting one. This is the detail that
turns collection into intelligence, because the signal is almost never in the
current state — it's in the diff. What the careers page said in March, what it says
now, and which team grew in between. A pricing tier that existed in Q1 and doesn't
now. A support article that changed its recommended migration path. Overwrite the
table and you've thrown away the only part that was worth having.

The corpus lands in the warehouse alongside everything else. Sigma reads those
tables directly, which means the corpus, its row counts and the scrape history are
ordinary data — queryable, joinable, auditable with the same tools you already
point at revenue. There's no separate intelligence tool to trust and no export to
reconcile against reality.


TWO RULES THAT MAKE IT AN INSTRUMENT

First: every conclusion must cite a captured artifact. Scraped records carry a URL
and a timestamp, so this is mechanically checkable rather than honor-system. If a
claim can't be traced to something in the corpus, the model reasoned from priors
about your industry rather than from evidence about this company. Those two outputs
read identically. Only one is safe to act on.

Second: the corpus definition is data, not a prompt. Which sources, which cadence,
which selectors — declared in a table, versioned, diffable. Adding a source is a
row. What the agent is permitted to know becomes a reviewable artifact instead of a
paragraph of instructions someone hopes the model respects.


WHERE THE INFERENCE RUNS

This is the question anyone sensible asks first, and it deserves a real answer
rather than a reassurance. There are three configurations and they are not
equivalent.

Inference inside the warehouse — Snowflake Cortex, Databricks model serving. The
prompt and the rows are evaluated within the governance boundary you already audit.
This is the only setup where "the data never leaves" is literally true, and it's
worth confirming which models are in-boundary for your region and whether
cross-region inference is enabled, because cross-region routing crosses the line
the story assumes it doesn't.

Inference mediated by the platform — Sigma's own agent. Results leave the warehouse
to a model provider under Sigma's contractual terms. Governed, but not local.

Inference in a third-party client — Sigma's MCP interface consumed by Claude or
Codex. Those results land in someone else's context under whatever agreement you
happen to have, and an individual on a consumer plan is in a very different posture
from an enterprise with zero-retention terms.

So route by the sensitivity of the corpus rather than by which tool is pleasant to
use. In this design the external agent only ever sees the competitor corpus, which
is public by construction — things they published themselves. No internal data is
in its context at any point. That isn't leakage mitigated by policy. It's leakage
that isn't structurally possible, because the rows were never there. Anything
touching your own numbers stays behind the boundary with inference running there.


RUN IT BACKWARDS

Here's where the exercise earns its cost. The valuable output was never the
competitor's predicted move.

Point the same scrapers at yourself. What comes back is your own observable surface,
assembled exactly the way an outsider would assemble it. Not a guess about what
you're leaking — a capture of it, with each inference traced to the specific
artifact that permitted it.

Five Rust job postings announce a rewrite. A quietly retired pricing tier announces
a segment exit. A support-doc edit announces a deprecation before your roadmap does.
A conference talk abstract announces a partnership that hasn't been signed.

[ONE CONCRETE EXAMPLE FROM YOUR OWN WORK GOES HERE — a real inference this surfaced
that human review had missed. One paragraph of specifics is worth more than the rest
of this article. If it can't be disclosed, use an illustrative case and label it as
illustrative.]

That converts "what do they know about us" from a recurring conversation into a
finding with an owner and a decision attached: stop emitting it, or emit it
deliberately.


COUNTERFACTUALS

Because the corpus is a pipeline rather than a folder someone assembled once, you
can rerun it against a changed input. Two agents, each grounded only on what it can
observe of the other, iterating. Publish the case study or hold it. Post the job
listing or don't. Then rerun and read the difference.

A strategy offsite produces an opinion. This produces a delta you can point at.


THE FAILURE MODE, WHICH DESERVES MORE ATTENTION THAN THE TECHNIQUE

A selector changes. The actor returns zero rows. Zero rows does not raise an error.

The agent reasons from priors and confidently narrates a hiring freeze that is
actually a CSS change. Nothing in the output looks wrong, because the output is
articulate, plausible and internally consistent. Its only artifact is absence, which
makes it the hardest class of failure to catch by inspection — you cannot review
your way to noticing something that isn't there.

So the corpus gets a row count and an expected value before anything reasons over
it. Forty job postings yesterday and zero today is an alert, not a finding. The
scrape history is an append-only table you can query, so a collapse in volume is
visible as data rather than inferred from a strange conclusion three steps
downstream.

A competitive intelligence pipeline without that check is a strategy memo generator.


THE SAME PROBLEM AS ACCESS CONTROL

I spent last month building an application-level role-based access control model on
Sigma and publishing it, and the finding that transferred was this one: an agent
grounded on a scoped element cannot reason about rows that were never in its result
set. Nothing gets refused. There is no guardrail to argue with, because there's
nothing to argue about.

Defensively that's containment — you can't jailbreak your way into a table that was
never in the query. Offensively it's measurement. Same principle, opposite
direction, and both of them live in the data layer rather than in the prompt.

Worth being precise about what that demo proves and what it doesn't. It's published
on Sigma Public so anyone can open it without an account, and the same model runs
unchanged in SQLite. Together those establish the only claim it makes: scope can be
expressed as data rather than as an instruction, and that holds anywhere.

It is not the deployment target, and I'd rather say so than let anyone read it as
one. The free tier reads from CSV uploads, so there is no warehouse pushdown and no
real write path — the entry form demonstrates the gate rather than doing the work.
Everything the method above actually depends on sits on the subscription side:
writable tables backed by the warehouse, an append-only ledger your own queries can
reach, and the gate expressed as a governed view instead of a workbook element. That
last one is the difference that matters, because a view is inherited by every
consumer — including agents that never open a page.


HYGIENE

Robots.txt, rate limits, terms of service. Care with personal data appearing in
reviews and job listings, which is more common than people expect and carries
obligations that don't disappear because a scraper collected it incidentally.

And keep the outputs framed internally as your model of a competitor. Never as
their position, their analysis or their words.


Construct the corpus honestly, then refuse to help the agent past it. That's most
of what adversarial agent testing turns out to be.
```

### Accuracy constraints on this piece

These are the claims that were deliberately weakened, and why. Each one is a place where the
stronger version would have been the kind of overclaim the rest of this repo exists to avoid.

**"What leaves is the answer" — not "the data never leaves your warehouse."** Warehouse-native is
entirely true of Sigma's processing model; no extracts, computation pushed down. But the moment any
agent reads results into a model's context, that is egress. The unqualified version is the one a
security reader spots immediately.

**The published demo has no warehouse behind it, and the free tier is not the recommendation.**
Sigma Public uses CSV uploads. The demo proves that scope can be expressed as data, which is
tier-independent and is the claim being made — nothing more. An earlier draft mentioned the free tier
in a way that read as an invitation to build on it, which is both off-message and technically wrong:
writable tables backed by the warehouse, a queryable append-only ledger, and gates as governed views
are all subscription features, and this method depends on every one of them. The free tier is a
publishing vehicle for a read-only demonstration. Say which side of that line any given claim sits
on.

**Three inference locations, not two.** In-warehouse, platform-mediated, third-party client. Collapsing
these into "local versus cloud" loses the middle case, which is the one most Sigma users are actually
in.

**Verify before publishing:** which models are in-boundary for Cortex in the relevant region and
whether cross-region inference is enabled; and Sigma's current published data-handling terms for their
own agent, so the middle tier is described the way they describe it.

### The one thing still missing

The bracketed paragraph in RUN IT BACKWARDS. Everything else in the article is method; that paragraph
is evidence. A reader deciding whether this was run or merely designed will decide there.

---

## Planned — the containment post

Outlined 2026-07-30, not drafted. Rides the same external-agents announcement and should go out first,
while that still has attention on it. The competitor article has no clock on it and lands harder on a
reader who has already accepted that corpus boundaries matter.

The spine:

- **The line to build around.** Prompt injection is an attack on instruction-following. If the boundary
  is an instruction, injection defeats it. If the boundary is context membership, injection has nothing
  to work with. You cannot jailbreak your way into a table that was never in the result set.
- **"Independent of any workbook"** is the hard test of the jail metaphor. Every gate in this repo is a
  workbook element. An agent that reaches data without traversing the workbook does not traverse them
  either — not because it broke anything, but because they were never on its path. That is a statement
  about where authors put their gates, not a criticism of the platform.
- **"Talk to multiple workbooks at the same time"** is the union-of-corpora problem shipping as a
  convenience feature. One agent spanning several corpora is compartmentalisation dissolving by product
  decision rather than by compromise. Nobody argues against an agent that can see more, which is exactly
  why the containment cost needs naming now.
- **Where the boundary has to live** if agents no longer arrive through the page: a governed view at the
  data layer, inherited by every consumer, rather than a join authored in the presentation layer.
  `oracle/queries.sql` already expresses the predicate as SQL — `scoped_inventory` is the proof it ports.
- **The unresolved question**, which is the one to ask Sigma directly rather than infer: does an external
  agent propagate the calling user's identity? Without it there is no acting user to scope to, and
  per-user scoping is impossible at that layer regardless of how good the view is.

**Do not reference a test result that hasn't been run.** Step 24 in `BUILD_LOG.md` describes the
experiment — point an external agent at this workbook as Kwame and compare to 31,500. Citing an
untested number in a post riding a launch is the one move that turns a credible observation into
something the vendor has to correct.
