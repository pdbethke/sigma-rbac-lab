# Field guide

Field notes from building a multi-user application in Sigma, indexed by **what you see** rather than
by what causes it. Every entry was verified against a published workbook read from an anonymous
browser session.

**If you read one thing:** the editor reflects your own session — its data and its control values.
That is what you want while building, and it is a different question from what a viewer sees.
Verify in three sessions: anonymous, authenticated non-owner, owner.

---

## Blank and missing data

### "My input table shows column headers but every cell is empty"

Often with a handful of placeholder rows and one fewer column than you built.

**Mechanism.** Input-table data is versioned per mode. The draft is a branch of the elements *and*
the data, and the two copies are independent — publishing merges elements, not rows.

This is deliberate and correct. While you build, real users are writing to the published app. If a
publish promoted your draft's copy of the data, it would overwrite everything they had written since
your draft began. Keeping them separate gives you a sandbox to test destructive changes in.

**Cause of the symptom — two known routes to it:**

**1. Data entry permission set to "Editable in draft".** Rows you entered went into the draft copy;
the published copy was never populated.

**2. You caught it in a transient post-publish state.** An input table was observed rendering with
its row count intact and every value blank, then rendering completely on a later read — same
element, same data, no changes in between. **Publish again and re-read before concluding anything
is wrong.** A blank table that fixes itself will otherwise send you looking for a fault that does
not exist.

Route 2 is the one that looks arbitrary from the outside, because it hits **exactly the tables you
wire actions to** — junctions, permission tables, audit logs — while every static reference table
on the same page keeps working.

**Fix.** Set the table to **Editable in published version** and enter the data through the
**published app**, not the editor.

**Confirm.** Open the published link in a private window and compare the row count against the
editor. If they differ while the element definitions are identical, the data has forked.

---

### "It works perfectly for me and nobody else can see it"

**Cause.** Usually the data-versioning behaviour above. Sometimes an empty control (see *Identity*).

**Fix.** Verify in a published, anonymous session before concluding something works.

---

### "My row count is right in the editor and wrong in the published app"

Same cause. The editor is reading draft data.

**Confirm.** Both numbers are real — they're two different copies. Decide which one your users are in
(the published one) and treat the other as scratch.

---

## Joins

### "My join returns 0 rows and there's no error"

**Cause.** An **inner join** over multiple sources. One source came back empty and the inner join
multiplied it out to nothing.

**Why it's so hard to diagnose.** A four-source inner join returns `0 rows` *identically* no matter
which source failed. No error, no partial result, nothing to inspect. You cannot tell from the
output which of four things broke.

**Fix.** Make every resolution join **LEFT**. Then a failed source returns rows with nulls in one
column, which names the culprit on sight.

The join editor offers the full set — **Left outer, Inner, Right outer, Full outer** — under
**Join type**, with Left outer listed first. Choose deliberately on every join rather than accepting
whatever is selected.

```
inner:  0 rows                    ← which source? no way to know
left:   9 rows, Scope Name null   ← it's the scopes join
```

This costs nothing when everything works and saves an afternoon when it doesn't.

---

### "Rows with an empty foreign key disappeared"

A grant with no scope, an order with no discount, any nullable FK.

**Cause.** Inner join to the dimension. `NULL = anything` is never true, so the row is dropped.

**Fix.** LEFT join, and `Coalesce()` the display value:

```
Scope = Coalesce([Scope Name], "ALL SCOPES (global)")
```

**Confirm.** Count the nulls deliberately. If your data has *n* rows with an empty FK, the joined
output must still contain *n* of them. If it doesn't, the join dropped them — without an error,
because dropping non-matching rows is what an inner join is for.

---

### "The join key picker only offers columns I don't want"

**Cause.** The **"Join with"** dropdown decides which source's columns you can key on. It does not
default to the accumulated output — it defaults to whatever you joined last.

**Fix.** Set **Join with** deliberately on every join, *before* touching the keys.

**Rule of thumb.** Work out which table actually *knows* the thing you're keying on. In an RBAC
model, `Permissions` and `Resources` hang off the **role**; `Scopes` and `Users` hang off the
**assignment**. A permission says what a role may do — it has no idea who holds it.

---

### "Unknown column" after a join

**Cause.** When a column name exists on both sides, Sigma keeps both and **qualifies the second with
its source**: `Role Id` and `Role Id (Assignments)`.

**Fix.** Use the qualified name downstream. Always pick from autocomplete rather than typing.

---

### "My output has way more columns than I expected"

**Cause.** A source added to the graph twice. Each copy contributes its full column set.

**Confirm.** The **FINAL OUTPUT** line in the join editor (`5 sources – 28 columns`) is the cheapest
check that the graph is what you think it is. Watch it after every change.

---

### Read the key-match panel before committing a join

The join editor reports, per side: **total keys**, **keys with no matches**, **keys with 2+
matches** — with the offending values listed and colour-coded. This is the most useful thing in the
product and it runs *before* you commit.

**Unmatched keys are not automatically wrong.** In one of our joins, 495 of 501 users were unmatched
— correct, because 495 people held no grant. In another, exactly one resource was unmatched —
correct, because that resource is granted universally rather than through a role.

> **The standard: you must be able to name every unmatched key.** If you can't explain one, that's
> your bug. 100% unmatched is a config error, not a data problem.

**One exception — a `null` bucket on a LEFT join may be structural.** The left side is defined to
preserve unmatched rows, so the panel can display a `null` unmatched key whether or not any row
actually carries it. Observed: a join reporting one unmatched `null` while the output contained no
nulls at all across 501 rows.

**A *named* unmatched key is data. A bare `null` on the left side may just be the join type.** Check
the output before treating it as a defect.

---

## Elements and dependencies

### "I deleted one element and three other things broke"

**Cause.** Sigma references elements by internal ID, and those references are invisible from the
element you are deleting. Deleting one takes out its children, any control using it as a **value
source**, and any action **targeting** it — silently, and only discovered when someone looks.

**Fix.** **Extend elements; don't delete and recreate.** Joining a new source *into* an existing
element preserves its ID and every reference to it. Recreating mints a new ID and orphans them all.

**Before deleting anything, ask what points at it.** Nothing will warn you.

> A deleted Django model breaks imports loudly at startup. A deleted Sigma element breaks its
> dependants quietly, at the moment someone opens the page.

---

### "The source picker won't let me re-point this element"

**Cause.** An element created *as a child of* another often cannot have its source swapped — the
picker simply doesn't offer alternatives.

**Fix.** Build the replacement alongside, re-point its consumers, then retire the original. Don't
delete first and rebuild — see above.

---

### "My grouped element won't collapse"

Groups show `+` expanders and expand into their underlying rows instead of one row per group.

**Cause.** Detail columns are still visible, so they remain part of the **display grain**.

**Fix.** **Hide them, don't delete them.** Hidden keeps a column available to calculations while
removing it from the grain, and the group collapses.

> In SQL, selecting a non-aggregated column outside the `GROUP BY` is an error you fix in ten
> seconds. Here it silently widens the grain and looks like the grouping didn't work.

---

### "I can't filter on that column — it's not in the element"

**Cause.** The column isn't in the display grain, so it isn't offered.

**Fix.** Add the filter through **Available fields**. The column is still in the source and remains
reachable, and the filter applies to source rows *before* any grouping collapses them.

> The thing you need to filter on is frequently not the thing you are displaying.

---

### "My control offers no values, and its source element clearly has rows"

**Cause, most often.** The filter feeding the source element is a **list filter with nothing
selected**. Open it: if the value picker shows counts (`store 3 / global 1 / none 1`) the column
binding was right all along and only the selection is missing. An empty list filter and a wrong
column binding present identically from the outside.

**Cause, when several filters are stacked.** They intersect to zero and the count tells you nothing
about which one is responsible.

**Fix.** Disable them all, then re-enable **one at a time**, reading the row count after each.

    no filters                      10
    Is Visible                      10    unchanged - see below
    + Resource Key = "inventory"     5
    + Scope Type = "store"           3

> A filter that changes nothing for the user you are testing is not inert. Test each predicate
> against the identity it is supposed to *exclude*. `Is Visible` moves nothing for a global user and
> is the entire gate for everyone else.

**The related trap: two columns with nearly the same name.** A joined element can carry both the
row's own attribute and the acting user's resolved one — `Scope Type` beside
`Scope Type (Resolution)`. They mean different things and the picker matches on display name. Rename
one of them at the point of joining; `Grant Scope Type` for the resolution copy costs nothing and
makes the confusion impossible.

---

## Identity and choosers

### "My login list only shows the person who's already selected"

Or: the roster shows one row, and you can't switch away from whoever you picked.

**Cause.** The roster is descended from an element the identity control **filters**. It inherits that
filter, so the list of people you could be is filtered by the person you are.

**Fix.** **Source the chooser from something the control does not target.** Here the roster comes
from `assignments` (who holds a live grant) rather than from the resolution (what a user may do) —
which is also the semantically correct source.

> You would never build a login page whose user list is filtered by the current user. It's easy to
> do here by accident, because the filter is inherited rather than written.

**Related:** a control's **value source** pointing at the element it filters is circular. Sigma
tolerates it — it appears to ignore a control's own filter when computing its value list — but point
it somewhere independent and say what you mean.

---

### "Pages everyone should see never appear in the nav"

Home, Profile, a landing page — resources that need no grant.

**Cause.** They're being fetched through the permission join. A universal resource **has no
permission row** — that's what universal means — so nothing derived from the resolution can ever
contain it, no matter what you unfilter.

**Fix.** Two branches, joined at the end:

```
resolution ──▶ granted resources     reached THROUGH the permission model
resources  ──▶ universal resources   reached AROUND it
                    │
     both feed ──▶ nav (FULL OUTER join on resource key)
```

A **full outer join** does the dedupe as join semantics: a resource in both branches matches and
collapses, and one in only a single branch keeps its row with the other side null. Coalesce every
output column, because every unmatched row has nulls on one side.

**Watch for the double-arrival case.** If a universal resource is *also* granted to some role, it
arrives by both paths. That's the case worth testing deliberately — one identity where a key matches
on both sides.

---

## Filters and formulas

### "My status filter matches nothing"

**Cause.** A quoted value written into a static field. Sigma writes `"active"` literally, including
the quotes, and it never equals `active`.

**Fix.** Static-value fields take **raw** text: `active`, not `"active"`.

**Confirm.** Read the actual cell. Don't trust the confirmation message.

---

### "Unknown column" pointing at a column that exists

**Cause.** You typed a formula **onto an existing column**. That severs the column's identity — the
reference becomes a calc pointing at a name that no longer exists, so it references itself and finds
nothing.

**Fix.** Create the column with **`+` first**, then type the formula into the new column. A formula
always needs its own column.

---

### "Types didn't carry over from the parent"

**Cause.** Type and number format are **per-element**. They do not cascade to children or charts.

**Fix.** Set them on the element that displays them. Re-check after every source swap — especially
booleans and anything that should be a number.

---

## Identity and access

### "Everything is empty for logged-out visitors"

**Cause.** An identity control with no value. `[User Id] = <empty>` evaluates to **null**, not false
— so every filtered element returns zero rows, with no error.

Worth knowing about because there is no error state to notice — an element with no matching rows
and an element with a null comparison look identical.

**Fix.** Give the system a **named anonymous principal** — a real user row at the RFC 4122 nil UUID
`00000000-0000-0000-0000-000000000000`, holding a `public` role granted the universal resources.
Default the control to it.

Then the control is never empty, an anonymous visitor resolves through exactly the same joins as
everyone else, and there is no null-handling anywhere in the resolution layer. "Logged out" stops
being a special case and becomes an identity with one grant.

Every serious auth system does this: Windows has `ANONYMOUS LOGON`, Unix has `nobody`, OIDC has the
unauthenticated principal.

---

### "Can anonymous viewers write to my input tables?"

**No, and no setting changes it.**

Writing requires the **`Edit input tables` account-type permission**. An anonymous visitor doesn't
fail that check — they can't take it, because they have no account.

The **"Editable in published version (all access levels)"** option reads like it includes them. It
doesn't. "All access levels" means all *workbook* access levels — view / explore / edit — and every
one of those presupposes an account.

**What the button tells you:**

| `Edit data` button | Meaning |
|---|---|
| shown, enabled | you may edit |
| shown, **disabled** | configured editable; you lack the permission or access |
| **not shown** | not configured for editing in the published version |

A greyed button in an anonymous session is the system working correctly, not a symptom.

**In an embedded deployment this changes.** You mint a JWT per user from your own auth, so those
users are authenticated without holding Sigma accounts — and the write path opens to them. That's
the bridge from a public prototype to production.

---

### "Can ordinary users write, or only me?"

Ordinary users can. A free account carries the `Edit input tables` permission by default, and a
non-owner can edit through the published app in view mode — verified end to end: add a row, save,
delete it, save.

**So the access model is: anonymous reads, authenticated writes.** You don't build a login; you
consume the platform's. The public link is a complete, functional, read-only application that needs
no defensive configuration to be safe to share.

---

### "How do I stop a user seeing a page they shouldn't?"

**You don't hide the page. You scope the data.**

Hiding a tab is **cover, not control** — pages are client-rendered UI, and Sigma's own documentation
says if/else logic is not a security feature. Conditional visibility that hardcodes `role = "admin"`
looks locked without being locked.

**Do this instead:** filter every sensitive element by the acting user's resolved authority. A user
without the grant walks into the page and finds **an empty room** — not a locked door, not an error,
just nothing, because the rows were never in their result set.

Same posture as row-level security in a database. The query returns what they're allowed to have,
and the UI is only ever a rendering of that.

---

### "My dropdown started demanding a login"

Anonymous viewers get Sigma's *"Build with Sigma Public — Sign in to use this feature"* modal when
they touch a control that worked fine yesterday.

**Cause.** An **action was attached to that control**. Anonymous viewers cannot write to input
tables at any permission level — writing requires the `Edit input tables` account-type permission
and they have no account — so firing a write on change prompts them to sign in.

**Fix.** Condition the action so it does not fire for anonymous viewers:

```
when  CurrentUserEmail() <> "sigma.public+viewer0000000000@sigmacomputing.com"
```

That constant is the same for every anonymous viewer, which makes it useless for identity and ideal
as a predicate.

**The general rule:** *any* action on a control makes that control sign-in-gated for anonymous
viewers. If you care about a read-only public tier, every write action needs the guard — otherwise
the read-only experience gets walled off one control at a time, and each one looks like a separate
bug.

**Where to leave the prompt.** It is the platform's sign-up funnel and it is reasonable to let it
fire — just not on navigation or identity switching, where the visitor has seen nothing yet. Leave
it on the actions that genuinely change data, where someone has already watched the thing work.

---

## AI surfaces

### "The Assistant's numbers don't match what my users see"

**Cause.** The **Sigma Assistant** is an authoring tool. It's available only in edit mode, and it
reads the **draft**. It won't tell you that.

We tested this deliberately with draft and published disagreeing: the Assistant reported the draft's
numbers, confidently, with no indication which version it had read.

**Fix.** Treat its analysis as a description of what you're *building*, never of what you *shipped*.

**By contrast**, an **agent / chat element** embedded in a workbook is published, available to
viewers including anonymous ones, and reads **published data**. Each surface reads the context it
lives in.

---

### "My agent answers questions the user's own screen refuses to show them"

**Cause.** The agent is grounded on the full model rather than a user-scoped view. Every other
element resolves through the permission chain and fails closed. The agent reads the tables directly.

Ours announced its own reach unprompted, to an anonymous visitor: *"I can query across your
departments, users, roles, permissions, assignments, resources, and scopes"* — offering to identify
who has access to what, and who granted it.

**Fix.** **Scope the grounding. Do not instruct the agent to behave.**

- ❌ Ground on the full resolution, instruct it to only discuss the current user → **cover.** The
  data is in its context; prompt it right and it answers about anyone.
- ✅ Ground on a proxy filtered to the acting user → **control.** It cannot answer about other
  people because it has never seen them.

An agent that cannot be denied is not governed.

---

### "A generated element has no visible filter, but rows are missing"

**Cause.** The element is backed by **raw SQL**, with the filter in a `WHERE` clause rather than a
Sigma sheet filter. Both are legitimate; they just live in different places. The filter panel shows
only the sheet filters, so a query-level filter leaves the panel empty.

**Note:** adding a sheet filter on top does not replace the query one. Remove the sheet filter and
the `WHERE` clause still applies, with nothing in the panel to indicate it.

Worth knowing on a permissions table: someone clearing the filters to ask *"show me everything"*
receives the query's answer, not the table's.

**Fix.** Read the element's source. If it is SQL-backed, the `WHERE` clause is part of the source
definition and belongs in whatever documents the element.

**It is the mirror image of hiding a tab:**

| | Looks | Is |
|---|---|---|
| Conditional visibility on a page | locked | open |
| Filtering in the query | open | filtered |

Same test either way: **can you see the artifact's posture from the artifact?**

---

### "The AI documented my element — can I trust the description?"

**Verify the join types yourself.**

Asked to describe a hand-built element, an AI assistant got every claim about *mechanism* right —
correctly identified it as visually built, correctly noted there was no `WHERE` clause, no window
functions, and that grouping was visual — and then wrote **three INNER joins for an element that
uses LEFT OUTER on all four**.

**It disclosed the guess.** Verbatim: the element *"was built using Sigma's visual UI, **likely**
through drag-and-drop"*, the SQL was offered *"**based on its structure**"*, the block was commented
`-- Conceptual SQL`, and the stated goal was output *"that **would produce the same result**"*.

Every one of those is accurate. It flagged that it could not observe the join configuration, that it
was inferring, and that it was matching **output** rather than **construction**. Its claim was
literally true — INNER and LEFT produce identical rows on this data.

So the problem isn't dishonesty. It's this:

> **The caveat lives in the prose. The artifact doesn't carry it.**

The hedge sits in a paragraph above a code block. The code block looks authoritative —
schema-qualified, precisely aliased, syntactically complete — and the code block is what gets copied
into a ticket, a migration, or a review. **The disclaimer does not survive the copy-paste.** Once
it's gone, nothing in the artifact marks which parts were observed and which were guessed.

It also isn't a translation artifact: **the join editor offers inner, left outer, right outer and
full outer as equal options**, so both surfaces can express both choices. INNER is the reasonable
default; LEFT was a deliberate choice made for diagnosability, and that intent is **not recoverable
from the output**.

> **A correctly hedged inference and a verified fact render identically. Only one is safe to build
> on.**

Nothing in a normal review catches it. The rows match, the aliases are exact, the caveats are
appropriate. You'd only find it by opening the join editor and comparing — which is exactly the
review nobody performs on documentation, because documentation is what you read *instead of* the
source.

**Practical rule:** when an AI describes an artifact it cannot directly observe, treat every
structural claim as a hypothesis and verify it against the source. Ask it explicitly what it could
and couldn't see — it will tell you accurately.

---

## Verification

### Test in three sessions, every time

| Session | Catches |
|---|---|
| **Anonymous** (private window) | draft-only data, empty controls, missing elements |
| **Authenticated non-owner** | permission assumptions, write access |
| **Owner** | what you already believe |

Owner-only testing proves nothing — the owner sees everything by construction.

---

### Build an oracle

Load the same seed data into SQLite (or any database), write the resolution as one SQL statement,
and freeze the expected output. Then every element you build has a **known-correct answer to diff
against**.

Without one you're reading row counts with no way to know whether the number is right. With one,
"my element returns 6 rows" becomes a test rather than a hope. See `oracle/` in this repo.

Three independent constructions agreeing — hand-built element, generated SQL, and the oracle — is
much stronger evidence than any one of them alone.

---

### Read counts from the accessibility tree, not from screenshots

If you automate verification, every element's `N rows – M columns` is exact text in the page's
accessibility tree. One query returns all of them.

**Caveats learned the hard way:** the data grid itself exposes no per-cell nodes, so reading cell
*values* needs a screenshot and driving the grid needs coordinate input. Row operations live on the
**right-click context menu**. A fresh browser context — not just cleared cookies — is what gives you
a genuinely anonymous session.

---

### Watch the column count

`FINAL OUTPUT — 5 sources – 28 columns` is the cheapest possible check that your join graph is what
you believe. A duplicated source, a missing join, an extra calculated column — all show up there
before they show up anywhere else.

The same signal works in reverse: an element that comes back with **one fewer column than you built**
is telling you something didn't survive publication.
