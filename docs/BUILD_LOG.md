# Build log

Every step: build **one** thing → publish → open the published URL in an **anonymous** session →
record row **and** column counts → diff against the oracle fixture.

Verification is done by loading the public workbook URL in a fresh browser session with no Sigma
login. The editor reflects the author's own session — its data and its control values — which is
exactly what you want while building. What a viewer sees is a separate question, and looking is the
only way to answer it.

Workbook: `Test - Pls do not use - Multi-User/Role System Public debugging`
Oracle fixtures: `expected/`

---

## Step 0 — the nine base tables

**Built:** each of `data/*.csv` uploaded via **Add element → Input tables → CSV**.

There are three kinds of input table and only one of them takes a file:

| | Empty | **CSV** | Linked |
|---|---|---|---|
| Pre-populated | no | **yes, from upload** | yes, from a parent element |
| Add rows manually | yes | yes | no |
| Cell editing | yes | yes | data-entry columns only |
| Primary key | not required | not required | **required** |

There is no path from a static uploaded table to an input table — you choose the type when you
create the element. Uploads are capped at 200 MB and must be UTF-8.

**Result — all nine, verified anonymously, exact:**

| Table | Expected | Anonymous |
|---|---|---|
| Departments | 11 × 3 | ✅ 11 × 3 |
| Job Titles | 51 × 4 | ✅ 51 × 4 |
| Platform Roles | 2 × 3 | ✅ 2 × 3 |
| Users | 501 × 5 | ✅ 501 × 5 |
| Roles | 6 × 4 | ✅ 6 × 4 |
| Resources | 7 × 7 | ✅ 7 × 7 |
| Scopes | 2 × 4 | ✅ 2 × 4 |
| Assignments | 7 × 7 | ✅ 7 × 7 |
| Permissions | 8 × 5 | ✅ 8 × 5 |

Not one missing column, not one null cell. The nil-UUID row and the blank `Scope Id` values came
through intact.

> **Finding: CSV input tables publish completely to anonymous viewers.**
> This retires "input tables don't render publicly" as an explanation for anything.

---

## Step 1 — first join: Assignments × Permissions

**Built:** `Permissions` LEFT JOIN `Assignments` on `[Role Id] = [Role Id]`.

**Expected 9 rows** — seven assignments fanning out through their roles' permissions:
Kwame ×3 (supervisor grants two resources, IT grants one), Mateo ×2, everyone else ×1.
Seeing 9 out of 7 *is* the many-to-many resolving.

**Result: ✅ 9 × 12, anonymous.** All nine rows diffed against
`expected/join_assignments_permissions.csv` — every user, resource, and flag matched.

> **Finding: after a join, a column name that exists on both sides is qualified with its source** —
> `Role Id` and `Role Id (Assignments)`. Sigma keeps both rather than collapsing them. Downstream
> formulas must use the qualified name; typing the bare name gives "unknown column."

---

## Step 2 — second join: + Resources

**Built:** `+ Resources` LEFT on `Permissions.[Resource Id] = Resources.[Resource Id]`.

**Result: ✅ 9 × 19, anonymous.** All nine rows diffed again, now with `Resource Name` readable.

The join editor's **key-match diagnostics** are the most useful thing in the product and were
missed for two days:

| Side | Total keys | No matches | 2+ matches |
|---|---|---|---|
| Permissions | 6 | 0 | 0 |
| Resources | 7 | **1** | **2** |

Every number is explainable, which is the standard:

- The 1 unmatched (red) is **`profile`** — it has no permission row because it is
  `Universal = TRUE` and arrives through the universal tier, not a role grant. Unmatched by design.
- The 2 multi-match (green) are **`rulebook`** (builder + D.Ops) and **`entry`** (clerk +
  supervisor). Two roles granting one resource is exactly what `Max([Can Edit])` exists to collapse.

> **Rule: unmatched keys are not automatically wrong — but you must be able to name every one.**
> If you cannot explain an unmatched key, that is the bug. 100% no-matches is a config error.

---

## Step 3 — third join: + Scopes

**Built:** `+ Scopes` LEFT on **`Assignments.[Scope Id]`** `= Scopes.[Scope Id]`.

Join **with Assignments**, not Permissions. `Scope Id` lives on the assignment: a permission says
what a role may do, a scope says where the role was granted. Different tables, different questions.

**Result: ✅ 9 × 23, anonymous. 5 null `Scope Name` rows — confirmed.**

The five global grants survived the join:

| User | Role | Resource | Scope |
|---|---|---|---|
| Kwame Bianchi | it | Audit & Access | *(null)* |
| Mateo Boateng | builder | Composer | *(null)* |
| Mateo Boateng | builder | Rulebook | *(null)* |
| Priya Cohen | dops | Rulebook | *(null)* |
| Public User | public | Home | *(null)* |
| Liam Patel | clerk | Entry | Site 214 |
| Aaliyah Kowalski | clerk | Entry | Site 305 |
| Kwame Bianchi | supervisor | Review Queue | Site 305 |
| Kwame Bianchi | supervisor | Entry | Site 305 |

An inner join here returns 4 rows instead of 9 and eats every global grant — including the one
that makes the Audit & Access demo work. This is the one join in the build where the type is
load-bearing for **correctness**, not just for diagnosis.

The join graph, which makes the property visible at a glance:

```
Permissions ┐
            ├─ Left Join ┐
Assignments ┘            ├─ Left Join ┐
              Resources ─┘            ├─ Left Join (Final Output)
                          Scopes ─────┘
```

> **Practical note: reorder columns before you publish.** At 23 columns the fields a human reads —
> user, resource, scope, the two flags — are scattered among GUID columns and fall off the right
> edge. Sigma renders left to right and so does the reader.

---

---

## Step 4 — fourth join: + Users

**Built:** `+ Users` LEFT on **`Assignments.[User Id]`** `= Users.[User Id]`.

**Result: ✅ 9 × 28, anonymous. All nine rows diffed against the oracle — zero drift.**

| User | Resource | Scope | View | Edit |
|---|---|---|---|---|
| Aaliyah Kowalski | Entry | Site 305 | ✓ | ✓ |
| Kwame Bianchi | Entry | Site 305 | ✓ | — |
| Kwame Bianchi | Review Queue | Site 305 | ✓ | ✓ |
| Kwame Bianchi | Audit & Access | *(global)* | ✓ | ✓ |
| Liam Patel | Entry | Site 214 | ✓ | ✓ |
| Mateo Boateng | Composer | *(global)* | ✓ | ✓ |
| Mateo Boateng | Rulebook | *(global)* | ✓ | — |
| Priya Cohen | Rulebook | *(global)* | ✓ | ✓ |
| Public User | Home | *(global)* | ✓ | — |

Diagnostics on this join: **Users 501 keys / 495 no matches**, Assignments 6 keys / 1 multi-match.

> **Finding: a large unmatched count can be correct.** 495 people in the directory hold no grant.
> This contradicts the "100% no-matches is a config error" instinct — the real rule is that you
> must be able to *name* the unmatched keys. Here they are named: everyone without a grant.

Two things cost time here, both worth the guide:

- **The "Join with" picker decides which columns you can key on.** It does not default to the
  accumulated output. Set it deliberately on every new join. Keying `User Id` requires
  `Join with = Assignments`, because `Permissions` has no user column at all — a permission says
  what a role may do, not who holds it.
- **A source added twice silently inflates the graph.** `Assignments` appeared twice in SOURCES and
  the output jumped to `6 sources – 35 columns` with a phantom null key. The column count in
  FINAL OUTPUT is the cheapest check that the graph is what you think it is.

**The qualification rule held on every join:** the second occurrence of a name is suffixed with its
source — `Role Id (Assignments)`, `Resource Id (Resources)`, `Scope Id (Scopes)`,
`User Id (Users)`.

**Anchors:** every join attaches to one of two things. `Permissions` and `Resources` hang off the
**role** side; `Scopes` and `Users` hang off the **assignment** side. The assignment row is what
knows who, which role, where, granted by whom, when, and whether it is still active.

---

---

## Step 5a — do input-table writes reach an anonymous viewer?

**Built:** in the `Assignments` input table, changed Liam Patel's grant
(`9e99f22d-f001-4242-bb5d-49b88e96ad89`, clerk @ Site 214) from `Status = active` to `revoked`.

**First read (before publishing): the public view still showed `active`.**
**After publishing: the public view showed `revoked`.**

**Second test, which sharpened the finding.** Signed in, in **view mode** (not edit mode), revoked
Kwame Bianchi's supervisor grant (`4eddb889…`, supervisor @ Site 305) and clicked **Save**. **No
publish.** The anonymous view showed `revoked` immediately — while his separate IT grant
(`75195398…`, global) stayed `active`.

> **Finding: where you edit determines whether a write is live.**
>
> | Edited in | Reaches viewers |
> |---|---|
> | **Edit mode** (draft) | only after a **publish** |
> | **View mode** (published version) | **immediately, no publish** |
>
> The first test edited the draft, which is why it needed a publish — that was a property of *where*
> the edit happened, not of input tables. Administering data through the **published** app is live.
>
> This is what makes the write loop feel like an application rather than a deployment: an
> authenticated administrator revokes a grant and every reader, including anonymous ones, sees it
> stop granting on their next load.

> ✅ **RESOLVED in Step 5d below.** Original note kept for the reasoning trail. The observation above (anonymous view showed
> `revoked` with no publish) conflicts with a later report from the same session that public view
> *does* require a publish. Both cannot be right as stated. The most likely reconciliation, still
> untested:
>
> | Change | Live? |
> |---|---|
> | input-table **data** (a cell edit) | live — rows are in the warehouse, read at query time |
> | **element** changes (filters, columns, joins) | needs a publish — versioned with the workbook |
>
> That would make both observations true: the revoke was data and went live; whatever prompted the
> "requires a publish" report was an element change. **Test before writing this into the runbook:**
> from a signed-in view-mode session, change one cell, don't publish, and read the anonymous view
> immediately. Then add a filter, don't publish, and read again.

**Selective revocation works.** Kwame holds two roles; revoking the supervisor grant removed his
Review Queue and Entry access at Site 305 and left his global Audit & Access untouched. One grant
withdrawn, the other unaffected — which is the whole reason a grant is a row rather than a flag on
the user.

Type static values **raw**: `revoked`, not `"revoked"`. Quotes are written literally into the cell
and silently break every status filter downstream.

Type static values **raw**: `revoked`, not `"revoked"`. Quotes are written literally into the cell
and silently break every status filter downstream.

## Step 5b — can an anonymous viewer WRITE?

**Tested:** searched the published page's accessibility tree, in an unauthenticated session, for
an **Edit data** button.

**Result: no Edit data button is rendered at all.** Not present-but-disabled — absent.

Sigma's decision table for the button:

| Button state | Meaning |
|---|---|
| shown and enabled | you may edit |
| **shown but disabled** | configured editable, but you lack the account-type permission or workbook access |
| **not shown** | not configured for editing in the published version |

Editing input-table data in a published workbook requires the **"Edit input tables" account-type
permission** *and* sufficient workbook access. An anonymous visitor has no account, so no account
type, so no permission — regardless of the data-entry setting.

> **Finding: the write path is closed to anonymous viewers, and that is the safe posture.** If it
> were open, anyone holding the URL could edit the authorization data. Seed and administer through
> an authenticated session; publish for readers.

**Confirmed a second way:** the `Assignments` table was explicitly set to be writable in the
published version and opened in a private window. Still not editable. So no data-entry setting can
open writes to an anonymous visitor.

**Why — and this is the part the docs make easy to misread.** "Editable in published version (all
access levels)" means *all workbook access levels* — Can view / Can explore / Can edit. Those are
properties of an **account**. The second gate, the **`Edit input tables` account-type permission**,
presupposes an account exists. An anonymous visitor doesn't fail that check; they can't take it.

So it is not that writeback is disabled for Sigma Public — it is that **Sigma Public's audience is
identity-less, and writeback is defined in terms of identity.** That framing matters because it
predicts where the behavior differs:

| Deployment | Viewer identity | Writeback |
|---|---|---|
| Sigma Public, anonymous | none | impossible |
| Sigma Public, signed in | real Sigma account | yes, per permissions |
| **Embedded** (paid), JWT user | signed identity minted by *your* app | **yes** — the JWT carries the account type |

That last row is the bridge from this lab to a production build, and the answer to *"our users
won't have Sigma logins"*: in an embedded deployment you mint a JWT per user from your own auth, so
they are authenticated without being Sigma account holders, and the write path is open to them.

## Step 5d — can an authenticated NON-OWNER write? (the load-bearing question)

**Tested:** signed a second, throwaway Sigma Public account into the published workbook — an
ordinary free account, not the workbook owner — and drove it end to end.

| Session | `Edit data` |
|---|---|
| Anonymous | present, **disabled** |
| **Authenticated non-owner, free account** | **enabled** |

**Full write cycle completed:** clicked `Edit data`, added a row to `Scopes`, clicked `Save`. The
row persisted server-side. Deleted it afterwards via **right-click → Delete 1 row**, saved again,
table restored to 2 rows.

> **Finding: a free Sigma Public account carries the `Edit input tables` permission by default.**
> The application is genuinely multi-user writable, not owner-only. This was the load-bearing
> assumption under "sign in to use the app" and it holds.
>
> Practical consequence: an audience can be handed the URL, sign up free, and *use* the
> application — propose, approve, grant, revoke. Not merely watch someone drive it.

> **Finding: input-table data writes propagate LIVE across sessions, with no publish.** The write
> made from the second account appeared in the owner's already-open session as a live refresh.
> This resolves the question flagged unresolved above:
>
> | Change | Live? |
> |---|---|
> | input-table **data** (cell edits, row add/delete) | **live, cross-session, no publish** |
> | **element** changes (filters, columns, joins) | versioned with the workbook — needs a publish |

**Method note.** Sigma's data grid is not exposed to the accessibility tree — there are no
per-cell nodes to target. Driving it programmatically requires coordinate-based mouse input.
Row operations live on the **right-click context menu**: Insert above/below, Duplicate,
**Delete 1 row**, Keep only, Exclude.

**Note:** pressing `Enter` after typing into the `+` row advances the cursor and creates
*another* pending row. `Escape` does not discard it — it stays pending and `Save` commits it. Two
junk rows resulted from one intended insert. Check the row count before saving.

**Testing asset:** keep a throwaway non-owner account. Owner-only testing proves nothing about what
users experience — the owner sees everything by construction. Every claim about the app should be
verified in three sessions: anonymous, authenticated non-owner, owner.

## Step 5c — controls

A control added to the page **renders for anonymous viewers** — and renders **empty**.

> That empty box is the failure mode that destroyed the predecessor workbook. An element filtered
> by `[User Id] = [empty control]` returns zero rows with no error, because a null comparison
> evaluates to null rather than false. It is the entire argument for the anonymous principal: give
> the control a real default (the nil UUID) so it is never empty for anyone.

## Decision — the access model

Established by the tests above, adopted as the architecture:

| Audience | Reads | Writes |
|---|---|---|
| **Anonymous** (public link) | ✅ everything | ❌ no affordance |
| **Authenticated** (Sigma account) | ✅ everything | ✅ via `Edit data` in view mode |

**The write gate is Sigma's authentication.** The app does not implement a login, a session, or a
password — it consumes the platform's. Same posture as riding on AD in a corporate deployment:
*your identity system stays yours; the app consumes it.*

That stacks with, and does not replace, the authorization model:

| Layer | Answers | Enforced by |
|---|---|---|
| Authentication | may you write at all | Sigma |
| Authorization | what may you act on | `roles` / `permissions` / `assignments` |

Consequence: **the public link is a complete, functional, read-only application.** It needs no
defensive configuration to be safe to share. Acting on it requires signing in.

> **Untested assumption, and it is load-bearing.** Write access in view mode is confirmed only for
> the **workbook owner**. Whether an ordinary authenticated Sigma Public account carries the
> **"Edit input tables"** account-type permission is unknown. If it does not, only the owner can
> ever write and the app is read-only for everyone else — which would change what can be claimed
> about writable governance. A second throwaway account answers it in five minutes: sign in, open
> the public URL, check whether `Edit data` is enabled or greyed.

## Note — Sigma Public workbooks are listed, not just linked

Published workbooks appear in a browsable gallery on the Sigma Public sign-in page, not merely at
an unguessable URL. Assume anything published here is discoverable by strangers, and keep the data
synthetic.

## ⭐ Step 5e — the write-back permission level decides WHICH COPY of the data you edit

The most consequential finding of the build, and the hardest to catch.

**Symptom.** The editor showed `Permissions + 4` at **8 rows**. The published app — checked
anonymously, as a signed-in non-owner, and by the owner — showed **6 rows**. Publishing did not
reconcile them. The published `Assignments` table had Kwame's supervisor grant as `revoked`; the
editor had it as `active`. **Same input table, two different values, no error anywhere.**

**Cause.** An input table's write-back permission has three levels, and the level does not only
decide *who* may write — it decides *where the write goes*:

The setting is called **Data entry permission**, per element. Verbatim options and subtitles:

| Option | Sigma's subtitle | Write lands in | Who can actually write |
|---|---|---|---|
| **Editable in draft** | *Available to users who can edit the workbook* | the **draft copy** | the author, in the editor — **never reaches published** |
| **Editable in published version (restricted)** | *Available to users who can explore or edit the workbook* | published data | authenticated, with explore/edit access |
| **Editable in published version (all access levels)** | *Available to all users with access to the workbook* | published data | authenticated only — **not anonymous** |

**The third option does not mean public**, despite reading that way. Verified: `Assignments` was set
to all-access-levels and a private window still could not edit. "All users with access to the
workbook" scopes by **workbook access level** — and every access level presupposes an account, while
writing additionally requires the `Edit input tables` account-type permission. An anonymous visitor
has access to the workbook and still cannot write. On Sigma Public, whose audience is identity-less,
the second and third options are functionally identical.

**Level 1 is a sandbox, and that is the point.** The draft is a branch of the elements *and* the
data. Publishing merges the elements; it deliberately does **not** merge the data — because while
you were building, real users were writing to the published app. Promoting a draft's copy of the
data on publish would clobber every grant, approval, and audit row written since the draft began,
silently and irreversibly. Not promoting is the only safe behaviour.

So developers get somewhere to revoke a grant, break the resolution, and test the empty-audit-room
case without touching what live users are doing. Same reason you do not develop against production.

**The boundary is correct; it is just invisible.** Nothing in the UI announces "you are editing
sandbox data." You see rows, you change them, they change. The only tell is comparing against the
published link — which nobody thinks to do, because the editor has never lied to them before.

> **Rule: administer data through the PUBLISHED app, not the editor.** The editor is for building
> elements. If an input table is on draft-level write-back, every grant you issue, every approval
> you record, and every revocation you make exists only for you.
>
> Same principle as verifying in an anonymous session, arriving from a third direction. The reason
> it matters: the change takes effect in front of you, so there is no prompt to check whether it
> took effect anywhere else.

**Detection:** compare a row count in the editor against the same element in the published link. If
they differ and the element definitions are identical, the data has forked.

**It is a per-table setting**, which is a useful capability in its own right: a governance layer
can legitimately mix levels — reference tables on draft-only so they cannot drift, the audit log
on published-editable so it can append.

---

## Step 6 — calculated column

**Built:** a **new** column on the join (created with `+` first, then the formula typed in):

```
Scope = Coalesce([Scope Name], "ALL SCOPES (global)")
```

**Result: ✅ 6 × 29, identical in both sessions — anonymous and authenticated non-owner.**

| User | `Scope Name` (raw) | `Scope` (calculated) |
|---|---|---|
| Priya Cohen | null | ALL SCOPES (global) |
| Kwame Bianchi | null | ALL SCOPES (global) |
| Mateo Boateng | null | ALL SCOPES (global) |
| Mateo Boateng | null | ALL SCOPES (global) |
| Public User | null | ALL SCOPES (global) |
| Aaliyah Kowalski | Site 305 | Site 305 |

> **Finding: calculated columns evaluate for anonymous published viewers.** Worth testing
> specifically because the inputs here are nulls that exist *only* as a product of the LEFT joins —
> so this exercises the formula/join interaction, not merely the function.

**Always create the column with `+` before typing a formula.** Typing a formula onto an existing
column severs that column's identity; the reference becomes a calc pointing at a name that no
longer exists, and the error reads "unknown column" while appearing to reference itself.

**The data layer is now fully cleared** — nothing in it behaves differently for an anonymous
viewer: input tables, four chained LEFT joins, filters, and calculated columns all render
identically.

---

## Step 7 — grouping and aggregation

**Built:** grouped the join by `User Id` / `Resource Name` / `Scope`, aggregating with
`Max([Can View])` and `Max([Can Edit])`.

**Result: ✅ 6 × 31, anonymous.**

| User | Resource | Max of Can View | Max of Can Edit | Scope |
|---|---|---|---|---|
| `00000000…` Public User | Home | True | **False** | ALL SCOPES (global) |
| Priya Cohen | Rulebook | True | True | ALL SCOPES (global) |
| Kwame Bianchi | Audit & Access | True | True | ALL SCOPES (global) |
| Mateo Boateng | Composer | True | True | ALL SCOPES (global) |
| | Rulebook | True | **False** | ALL SCOPES (global) |
| Aaliyah Kowalski | Entry | True | True | Site 305 |

Mateo's two resources nested under a single `User Id` group; the display grain collapsed correctly.

> **Finding: grouping and aggregation evaluate for anonymous published viewers.**
>
> `Max()` over booleans is a logical OR and produces the same result as `MAX(can_edit)` in the SQL
> oracle — identical semantics, different engine. Hold two roles and either one granting edit gives
> you edit. Union of grants, never intersection.

The two `False` edit flags are the model earning its keep: they distinguish *reading* the rulebook
from *ratifying* it, which is the difference between a permission system and a visibility toggle.

**The data layer is complete.** Every construct tested renders identically for an anonymous viewer:
input tables, chained LEFT joins, filters, calculated columns, grouping, and aggregation.

---

## Step 8 — AI surfaces: which copy of the data does each one read?

Two distinct AI surfaces, and they behave differently. Both were tested against a state where the
draft and published data deliberately disagreed — draft had 8 resolution rows, published had 6, with
Kwame Bianchi holding three resources in the draft and one in published.

| Surface | Available to | Reads |
|---|---|---|
| **Sigma Assistant** (authoring copilot) | **editors only** — not present in view mode | the **draft** |
| **Agent / chat element** (published) | **viewers, including anonymous** | **published data** |

**The Assistant reported 8 records** and described Kwame as holding three resources across two
scopes. Accurate — for the draft. It did not indicate which version it had read.

**The agent, asked the same question from an anonymous session, reported published data:** Audit &
Access only, global scope. It agreed with the published `Resolution` element and with the SQL
oracle — three independent paths to the same answer.

> **Finding: each AI surface reads the context it lives in.** A viewer-facing agent describes the
> app users are actually in. The authoring Assistant describes what you are building.
>
> The practical rule: **the Assistant's analysis is of the draft, always, and it will not say so.**
> An access report that says 8 when production says 6 is exactly the sort of thing that gets quoted
> in a meeting. Since only editors can reach the Assistant, this is a discipline problem rather than
> a disclosure one — but it is worth knowing before citing its output as fact.

### Agent grounding is the real control surface

The chat element **renders for anonymous viewers** and, grounded on the full model, announces its
own reach unprompted:

> *"I can query across your departments, users, roles, permissions, assignments, resources, and
> scopes."* — offering to identify *who has access to particular resources* and *when permissions
> were granted and by whom*.

That is the one surface where the permission model does not apply. Every other element resolves
through `assignments → permissions → resources` and fails closed; an agent grounded on the whole
model answers freely, to anyone.

> **Rule: scope the agent's grounding, do not instruct it to behave.** Ground on a user-filtered
> proxy (`Resolution` filtered by the acting identity), not on `Resolution` itself. Instructing an
> agent to only discuss the current user is **cover**; giving it only that user's rows is
> **control**. An agent that cannot be denied is not governed.

---

## ⭐ Step 9 — the A/B: the Assistant does not build what you build

**Test:** asked the Sigma Assistant to reproduce the hand-built `Resolution` element — same five
sources, same joins, same filter, same calculated column, same aggregations.

**It produced identical output by an entirely different mechanism.**

| | Hand-built `Resolution` | Assistant-built `Resolution v2` |
|---|---|---|
| Mechanism | five-source **join graph** in the join editor | **raw SQL** data source |
| Filter | a **sheet filter**, visible in the filter panel | `WHERE a."STATUS" = 'active'` **baked into the query** |
| Elements created | 1 | **9 intermediate staging tables** + final output, on a new page |
| Inspectable via | the join editor, the filter panel | neither — you must read the generated SQL |

### The filter is the part that matters

The Assistant's filtering lived in the SQL, not in Sigma. Consequences, confirmed by the Assistant
itself when asked:

- The element renders with an **empty filter panel**. Anyone opening it reasonably concludes no
  filtering is applied. Inactive assignments do not appear to exist.
- **Removing the visible filter does not remove the filtering.** Once a sheet filter was added on
  top, stripping it leaves the `WHERE` clause in force — with no indicator anywhere in the UI.
- On a **permissions resolution table**, that is serious: an auditor who clears the filters to ask
  "show me everything" receives a filtered answer that looks unfiltered.

> **Finding: the Assistant authors raw SQL data sources, not UI-native elements.** The output can be
> identical while the logic becomes invisible to every surface you would normally inspect — the join
> editor, the filter panel, the source list.

### Two mirror-image cases

Same root property in both — the posture is not visible from the artifact:

| | Looks | Is |
|---|---|---|
| Conditional visibility on a page | locked | open |
| Filtering inside the query | open | filtered |

### The honesty distinction

The Assistant was **completely candid** when asked. Its explanation of the difference between a SQL
`WHERE` clause and a sheet filter was accurate, clear, and volunteered detail. The failure is not
candour.

> **The failure is discoverability: you would never know to ask.** The element renders, the row
> counts are right, and it agrees with the oracle. Nothing about it prompts the question *"is there
> a `WHERE` clause I cannot see?"*

This sharpens the model-authoring boundary from *"the AI might get the logic wrong"* to
**"the AI produces artifacts whose logic is not inspectable through the surfaces you would normally
inspect."** Correct output, unauditable construction.

Full transcript, in the Assistant's own words:
[`evidence/2026-07-25-assistant-sql-filter-transcript.md`](evidence/2026-07-25-assistant-sql-filter-transcript.md)
The generated query, annotated:
[`evidence/2026-07-25-assistant-generated-sql.md`](evidence/2026-07-25-assistant-generated-sql.md)

### The generated SQL differs in ways the output cannot show

**Three INNER joins where the hand-built element uses LEFT:**

| Join | Hand-built | Generated |
|---|---|---|
| → permissions | LEFT | **INNER** |
| → resources | LEFT | **INNER** |
| → scopes | LEFT | LEFT ✅ |
| → users | LEFT | **INNER** |

It got the join that matters for **correctness today** — `scopes` LEFT, preserving the five global
grants. But the other three being INNER means **identical output now, a different failure mode
later**. Delete a user or drop a resource and those rows vanish silently, where the LEFT version
would return them with nulls in one column and name the missing source on sight. The generated
element degrades into precisely the undiagnosable blank this lab exists to prevent.

**Table references are opaque element IDs** — `"elements"."output"."P_NoluRDR7"` and four more.
Reviewing the query for correctness means separately resolving five opaque handles. The artifact
cannot be audited on its own terms.

**`MAX(...) OVER (PARTITION BY ...)` rather than `GROUP BY`** — window functions do not collapse
rows. The query returns one row per join row; the six displayed come from a UI grouping layered on
top. Two aggregation mechanisms stacked, only one of them visible.

**Credit where due:** the aliases reproduce Sigma's qualification convention exactly, down to
`Role Id (Assignments)`. It understood the target precisely — it simply built it from different
materials.

### ⭐ And it misdescribed the human-built element the same way

Asked separately for "the equivalent SQL" for the **original, hand-built** element, the Assistant
wrote **three INNER joins**. **The hand-built element is LEFT OUTER on all four** — confirmed in the
join editor.

**It disclosed the guess, in prose.** Verbatim: built *"using Sigma's visual UI, **likely** through
drag-and-drop"*, offered *"**based on its structure**"*, commented `-- Conceptual SQL`, aiming at
output *"that **would produce the same result**"*. All accurate. It flagged that it could not observe
the join configuration and was matching **output**, not **construction** — and its claim was
literally true, since INNER and LEFT return identical rows on this data.

> **The caveat lives in the prose. The artifact doesn't carry it.**

The hedge sits above a code block that is schema-qualified, precisely aliased and syntactically
complete — and the code block is what gets copied into a ticket, a migration, a review. **The
disclaimer does not survive the copy-paste.** Once separated, nothing marks which parts were
observed and which were guessed.

Nor is it a translation artifact: the join editor offers **inner, left outer, right outer, full
outer** as equal options. Both surfaces can express both choices. INNER is the reasonable default;
LEFT was deliberate, chosen for diagnosability, and that intent is **not recoverable from the
output**.

> **A correctly hedged inference and a verified fact render identically. Only one is safe to build
> on.**

Anyone rebuilding from that SQL gets the fragile version — not because they were misled, but because
the warning stayed behind.

### Does the SQL-backed element publish? Yes.

Reached via a navigation button (published page tabs did not render), read anonymously:

| Element | Rows × Columns |
|---|---|
| staging ×8 | 7×14, 8×12, 9×26, 7×14, 9×40, 2×11, 9×51, 501×12 |
| **`Resolution v2`** | **6 × 65** |
| hand-built `Resolution` | 6 × 31 |

> **Finding: construction method does not affect publication.** SQL-backed elements publish exactly
> as join-backed ones do. The original hypothesis — that Assistant-built elements fail to publish —
> is **disproved**.

**Same answer, double the width.** `Resolution v2` returns the same 6 rows as the hand-built element
and as the SQL oracle: three independent constructions, one answer. But it carries **65 columns to
31**, because the staging chain accumulates rather than joining cleanly — 12 → 14 → 26 → 40 → 51 →
65. Invisible from the output; the rows are correct.

The Assistant also reported building "all 30 columns from the original." The element has 65. Its
self-report understates its own sprawl.

**So the A/B's finding is not about publication.** It is: identical output, invisible filtering,
nine extra elements, and double the width. Correct, and unauditable.

### What this means for the original investigation

Nothing in this lab reproduces the failure that motivated it. Every structural theory is eliminated
— input tables, joins, filters, calculated columns, grouping, controls, agents, and SQL-backed
elements all publish and render identically for anonymous viewers.

The only documented mechanism that produces *headers present, cells empty* is the one in Step 5e: a
table set to **Editable in draft**, populated in the editor, with an empty published copy.

---

## ⭐ Step 10 — control-filtered elements, and whether this is really multi-user

The question the whole build was aimed at: everything verified so far had been **unfiltered**.
Filtering an element by a control introduces the acting-identity layer, which is where a
multi-user application either exists or doesn't.

**Built:**

```
Roster        child of Resolution, grouped by [User Id], [User Name]   → the granted roster
User-Id       List control · value [User Id] · display [User Name]
              · Show operators OFF · default 00000000-0000-0000-0000-000000000000
Resolution    filtered where [User Id] = [User-Id]
```

The roster comes from `Resolution`, which is already filtered to active grants — so **only users
holding a live grant can be acted as**. Liam does not appear; his one grant is revoked. *No grant, no
login*, enforced by the data rather than by a maintained list.

### Result: it resolves for an anonymous viewer

Read from a browser session with no login that had never touched the control:

| | |
|---|---|
| `Resolution` | **1 row** |
| User Id | `00000000-0000-0000-0000-000000000000` |
| Resource | Home · view True · **edit False** · ALL SCOPES (global) |

> **Finding: a control-filtered element resolves correctly for an anonymous published viewer.** The
> default carries, the filter applies, and an unauthenticated visitor sees exactly the resources the
> data grants the anonymous principal.

Selecting a user changes it as the arithmetic predicts — Mateo returns his 2 rows (Composer with
edit, Rulebook read-only).

### Control state is per session

Two independent browser sessions, different selections, **no interference**. One viewer acting as
Mateo does not change what another viewer sees.

> **Finding: this is genuinely multi-user.** Several people can use the same published link
> simultaneously as different identities. This was the result that could have invalidated the whole
> pattern.

### Refresh resets to the default — for everyone

Reloading discards the selection and returns to the published default. **Confirmed in both an
anonymous private window and an authenticated session**, so this is not about whether the viewer has
an account to attach state to — control state is simply per page-load.

> **A control simulates identity; it does not authenticate it.** Real identity —
> `CurrentUserEmail()`, or a JWT in an embedded deployment — persists because it comes from an
> actual auth session. A control resetting on reload is consistent with something that was never
> authentication.

For anonymous viewers, **refresh is logout** — the right posture for a shared or public terminal,
where an abandoned browser should not leave someone acting as an admin.

### Control values cannot be set from the URL

`&User-Id=<guid>` appended to the public `view-workbook` URL was **ignored** — the session rendered
the default. (Only that syntax on that route was tested.)

- **For demos:** no per-persona deep links; visitors arrive as the anonymous principal and choose.
- **For security:** a viewer cannot be pushed into an identity by a crafted link.

### Two notes for anyone automating verification

- Sigma writes **"1 row – 31 columns"**, singular, when a filter returns a single row. A regex
  matching `\d+ rows` silently misses exactly the case you most want to catch. Use `rows?`.
- The **`Embed` element** puts external content *into* a workbook and is unrelated to Sigma's
  embedding feature, which puts Sigma into your application. Its URL field does accept dynamic
  values, so a control can drive an outbound URL — but not the reverse.

---

## ⭐ Step 11 — what `CurrentUserEmail()` actually returns on Sigma Public

Investigated while designing a session store. The results were not what the function name suggests.

**On Sigma Public, `CurrentUserEmail()` never returns a real email address.** Every context returns
a synthetic value shaped `<context>+<identifier>@sigmacomputing.com`:

| Context | Returned |
|---|---|
| Editor (workbook owner) | `edit+<guid>@sigmacomputing.com` |
| Authenticated published viewer | `creator+<guid>@sigmacomputing.com` |
| **Anonymous published viewer** | `sigma.public+viewer0000000000@sigmacomputing.com` |

Authenticated contexts get a **UUID**. Anonymous gets **zeros** — an asymmetry that says exactly
what it means: there is nothing to identify.

### Two anonymous viewers receive the *same* value

Verified with two independent browser sessions:

```
ANON A: sigma.public+viewer0000000000@sigmacomputing.com
ANON B: sigma.public+viewer0000000000@sigmacomputing.com
```

> ⚠️ **`CurrentUserEmail()` does not identify anonymous viewers.** It returns a value, so a null
> check will not catch them — but the value is a shared constant. **Anyone using it as a row-level
> security key on a public workbook is keying every anonymous visitor to the same row.**
>
> This is the single most dangerous thing in this document, because the function appears to work.

### The authenticated value is stable across reloads

```
reload 1: creator+<guid>@sigmacomputing.com
reload 2: creator+<guid>@sigmacomputing.com     ← byte-identical to reload 1
```

*(Handles for real accounts are redacted here. They are pseudonymous — see below — but there is no
reason to publish one. The anonymous value is quoted verbatim throughout because it is a shared
constant that identifies nobody, and its exact form is the point.)*

Cross-session stability was not tested and **does not matter**: a session store only has to survive
a refresh. A new browser session legitimately *is* a new session — the same contract a session
cookie offers.

### Why the address is synthetic — this is deliberate

Returning real addresses would let any public workbook harvest the email of every signed-in visitor
with a one-line formula. Synthesising `<context>+<guid>@sigmacomputing.com` gives a stable, usable
handle **without identifying anyone** — privacy by design, and it explains the zeros too: an
anonymous visitor has nothing to pseudonymise.

So the two consequences pull in opposite directions, and only one is a hazard:

| | |
|---|---|
| **Protective** | authenticated identity is pseudonymous — a public workbook cannot harvest real emails |
| **Hazardous** | anonymous viewers share one constant, making it unusable as an RLS key for them |

Storing the pseudonymous handle in a session table is therefore fine — it is a handle, not an
identity. A reader learns *"this session acted as Kwame"*, not whose session it is.

### What this means for identity

> **On Sigma Public, `CurrentUserEmail()` is a session handle, not an identity handle.**

- ✅ Usable as a **session key** — stable across refreshes, unique per authenticated session
- ❌ **Not** resolvable against a `users` table — it never contains a real address on this tier
- ✅ Anonymous collision is harmless **because anonymous viewers cannot write to input tables**. The
  shared key can never be written against; the platform's write boundary protects the session store
  without any code.

On a licensed tier with real accounts, or in an embedded deployment where you mint the identity
yourself, it would be both a session handle and an identity handle. Here it is only the former.

### Consequent design for persisted impersonation

```
sessions   (input table, append-only — also the impersonation ledger)
  Session Key   CurrentUserEmail()     -- verbatim; no need to parse the GUID out
  Acting As     [User Id]
  Updated At    Now()

Acting User =
  Coalesce(
    [User-Id],          -- explicit selection this page-load
    <latest Acting As for this Session Key>,
    "00000000-0000-0000-0000-000000000000"
  )
```

Append-only rather than upsert, so the same table that persists the choice also records **who acted
as whom, and when** — the impersonation audit trail, obtained as a side effect.

---

## Step 12 — a transient blank state after publishing (RETRACTED as a reproduction)

**This entry originally claimed to reproduce the failure that motivated this lab. It does not.
Retained because the intermediate state is real, and because the reasoning error is worth keeping.**

### What was observed

After wiring an `Insert row` action to the `Sessions` input table and publishing, the published view
showed:

| Session Event Id | Session Key | Acting As | Current Page | Updated At | ID |
|---|---|---|---|---|---|
| *(blank)* | *(blank)* | *(blank)* | *(blank)* | *(blank)* | `04A2A5117802426891EB30BF38C82F2D` |
| *(blank)* | *(blank)* | *(blank)* | *(blank)* | *(blank)* | `D5834AAF73ED4609A0E1B9748D3B2677` |
| *(blank)* | *(blank)* | *(blank)* | *(blank)* | *(blank)* | `B0A2A621D5E24428A05CEF590C8B0FFC` |

Row count present, headers present, every value absent, only the Row ID populated — the same
signature as the original failure. Nine CSV input tables on the same page were unaffected.

### What it turned out to be

**Transient.** On a later read the same element rendered **4 rows with every value present**,
anonymously, including the row written from the editor:

```
b0989045-…  seed+example@example.com   00000000-…  home           2026-07-25 09:00:00
62950132-…  seed+example@example.com   4885130b-…  entry          2026-07-25 09:04:12
90f191c8-…  seed+example@example.com   43a5625d-…  audit-access   2026-07-25 09:11:47
2ac54653-…  edit+<guid>@sigmacomputing.com  4563477f-…            2026-07-25 17:32:26
```

> **Finding, narrower but real: there is a window after publishing during which an input table can
> render with its row count intact and no values.** It resolves. If you catch a table in that state
> and conclude it is broken, you will chase a fault that does not exist — which is exactly what
> happened here.
>
> **Before diagnosing a blank input table, publish again and re-read.**

### The editor write did reach published

Contradicting the interim conclusion in Step 5 notes: the row written from the **editor** appears in
the published view (after republishing). So editor-side action writes are not confined to the draft.

### The reasoning error, kept deliberately

The false conclusion came from searching the page for cell values with `getByText` and treating an
empty result as evidence the values were absent.

**Sigma's data grid exposes no per-cell nodes to the accessibility tree** — established earlier in
this same build log, when a search for a visibly-present value returned nothing. The instrument
cannot detect the thing being tested.

> **Silence from an instrument that cannot detect the thing is not evidence of absence.** Row counts
> come from the accessibility tree; **cell values require a screenshot.** Two conclusions were drawn
> from that mistake before it was caught.

### Status

| | |
|---|---|
| Blank-then-populated state observed | ✅ confirmed |
| Resolves on republish / re-read | ✅ confirmed |
| Action writes break published values | ❌ **retracted — false** |
| Editor writes reach published | ✅ confirmed (after republish) |
| **Original failure explained** | ❌ **still open** |

---

## ⭐ Step 13 — a write action on a control makes that control require sign-in

**Observed:** after attaching `On change → Insert row into Sessions` to the identity control,
selecting a user **in a private window** produced Sigma's modal:

> **Build with Sigma Public** — *Sign in to use this feature*

The control had worked fine for anonymous viewers all day. The modal appeared only once a write
action was wired to it.

### Why

An anonymous viewer **cannot write to any input table, at any permission level**. Established
earlier in two ways: the `Edit data` button renders disabled for them, and setting a table to
*Editable in published version (all access levels)* still left it uneditable from a private window —
because writing additionally requires the **`Edit input tables` account-type permission**, and an
anonymous visitor has no account to carry one.

So the chain closes:

1. Anonymous viewers cannot write — *verified*
2. The control fires a write on change — *by design*
3. Therefore any anonymous interaction with that control prompts for sign-in

**Loosening the table's data entry permission does not help.** The account-type gate is second and
no table setting opens it.

### The fix: condition the write

```
On change → Insert row into Sessions
  when  CurrentUserEmail() <> "sigma.public+viewer0000000000@sigmacomputing.com"
```

Anonymous: the control changes, no write fires, no modal.
Authenticated: the control changes, the write fires, the session persists.

Two earlier findings combine into this. *Anonymous viewers cannot write* says the write must be
suppressed; *anonymous viewers all report one known constant* supplies the predicate. The constant
is useless as an identity and perfectly good as a test.

> **General rule: any action attached to a control makes that control unusable for anonymous
> viewers unless the action is conditioned.** Grant buttons, approve actions, audit writes — all of
> them. If a public read-only tier matters, every write action needs the guard, or the read-only
> experience becomes sign-in-walled one control at a time.

### Where to put the prompt

The sign-in modal is **Sigma's own funnel**, with *Join Sigma Public* as its primary button. The
question is not whether it fires but **where**:

| Fires when someone… | They have experienced |
|---|---|
| touches the identity switcher | nothing — first interaction, no value shown |
| tries to **grant, approve, revoke** | the whole demonstration |

Condition the write on the **identity switcher only** — browsing should be free, and switching
identity is the entire point of the demonstration. Leave genuine write actions unconditioned so the
platform's prompt fires at the moment someone is most persuaded.

### The resulting tiers

| | Anonymous | Authenticated |
|---|---|---|
| Read the whole application | ✅ | ✅ |
| Switch identity, watch access change | ✅ *(with the condition)* | ✅ |
| Selection survives a refresh | ❌ | ✅ |
| Write to governance tables | ❌ | ✅ |
| Appear in the audit trail | ❌ | ✅ |

Anonymous is a **stateless, read-only, fully interactive demonstration**. Signed-in is the
**application**. Every row falls out of the platform's write boundary rather than from
configuration.

> There is a neat closure in the audit row: anonymous sessions cannot be logged, and it does not
> matter. **The only actions worth auditing are the ones only authenticated users can perform.** An
> anonymous viewer switching identity changes nothing and leaves nothing to account for — the
> ledger is complete precisely because everything absent from it was incapable of having an effect.

---

## Step 14 — building the application layer: roster, directory, nav branches

Building the login roster and nav surfaced a set of structural rules. Several were learned by
breaking things.

### Deleting an element cascades silently

Deleting `Resolution` also destroyed `Roster`, which was its child — and the identity control's value
source pointed at `Roster`, so the control emptied too. Nothing warned about any of it.

> **Extend elements, don't replace them.** Before deleting, ask what references it. In Sigma the
> answer is often invisible until it breaks: a control's value source and an action's target do not
> announce themselves from the element being deleted.

Sigma references elements by internal ID, so **joining into an existing element is safe** while
delete-and-recreate mints a new ID and orphans every reference. Note also that a child element's
source often **cannot be re-pointed** — the picker won't offer alternatives — so the practical path
is: build the replacement alongside, re-point consumers, then retire the original.

### The chooser must sit outside the filter it drives

`Login Roster` was sourced from `Resolution`, which is filtered by the identity control. Result: the
roster showed **one row — the person already selected**. You could only ever pick who you had
already picked.

> **An element that offers a choice must not inherit the filter that choice drives.**

The fix was re-sourcing the roster from `Assignments` rather than `Resolution` — which is also the
semantically correct source:

| Question | Table |
|---|---|
| *Who holds a live grant?* (the roster) | `Assignments` |
| *What can this person do?* (the app) | `Resolution` |

Related: the control's **value source** was pointed at `Resolution` — the element it filters. Sigma
tolerated the circularity (it appears to ignore a control's own filter when computing its value
list) but it is not what you mean. Point value sources at an element the control does not filter.

### Identity and authority are different models

`Resolution` answers *what may this person do* and contains only users holding grants — five of them.
`User Directory` answers *who is this person* and contains all 501.

```
User Directory  ← Users ⋈ job_titles ⋈ departments      501 rows
Resolution      ← assignments ⋈ permissions ⋈ resources ⋈ scopes ⋈ users
```

Folding identity attributes into the authority model would have produced a seven-source join that
still had no rows for 496 people. Keep them separate and join where needed.

Note `departments` joins to **`job_titles`**, not to `Users` — department is reached *through* the
job title. That two-hop traversal is the schema's one derived dimension, and `Public User →
System Account → System` proves it resolves for the sentinel exactly as for everyone else.

### The two nav branches must be siblings, not chained

`Granted Nav` was built as a child of `Universal Nav`, so it returned the universal rows instead of
the user's grants.

```
Resolution ──▶ Granted Nav        resources reached THROUGH the permission model
Resources  ──▶ Universal Nav      resources reached AROUND it
                   │
     both feed ──▶ Nav Source (union, deduped)
```

**Universal resources cannot come through the permission join at all.** `Profile` has no permission
row — that is the single unmatched key the join diagnostics flagged in Step 2 — so nothing derived
from `Resolution` can ever contain it, no matter what you unfilter. If universal resources could be
reached through the join they would need permission rows, and then they would not be universal.

### Grouping: hide the detail columns or the grain won't collapse

A grouped element that still displays its detail columns keeps them in the display grain, so groups
expand into their underlying rows. `Granted Nav` grouped by `Resource Key` showed 8 rows because
`Can View`, `Can Edit`, `Resource Name` and `Sort Order` were still visible.

**Hide them rather than delete them** — hidden keeps them available to calculations while dropping
them from the grain.

### Filtering on a column that isn't in the grain: Available fields

`Granted Users` is grouped by `User Id`, so `Status` isn't in its output and appeared unfilterable.
It is reachable through **Available fields** when adding a filter, and the filter applies to source
rows *before* the grouping collapses them — so a user whose only assignment is revoked never becomes
a group.

> The thing you need to filter on is frequently not the thing you are displaying. Available fields
> is the answer.

### Organise into pages early

The workbook was reorganised into seven pages — Users · Navigation and Session · Permissions ·
Resources · Departments, Roles and Job Titles · Scopes · The Oracle. A single page holding a dozen
elements made the source picker hard enough to navigate that an element was lost in it.

### Verified state after the rebuild

Read anonymously across all seven pages:

| Element | Anonymous |
|---|---|
| `Resolution` | **1 × 28** — control filter live, default is the nil UUID |
| `Granted Nav` | 1 × 4 — follows the identity |
| `Universal Nav` | 2 × 3 — independent of it |
| `Login Roster` | 5 × 4 — independent of it |
| `Granted Users` | 5 × 2 |
| `User Directory` | 501 × 5 |
| `Sessions` | 8 × 6 — accumulating session events |

---

## Step 15 — the nav union, and why it is a FULL OUTER join

**Built:** `Nav Source` = `Granted Nav` **FULL OUTER JOIN** `Universal Nav` on `Resource Key`, plus
four `Coalesce` columns to collapse the two sides.

```
Nav Key    = Coalesce([Resource Key], [Resource Key (Universal Nav)])
Nav Name   = Coalesce([Min of Resource Name], [Resource Name])
Nav Order  = Coalesce([Min of Sort Order], [Sort Order])
Nav Edit   = Coalesce([Max of Can Edit], False)
```

### Why full outer rather than a union

A full outer join expresses all three cases the nav needs, and **does the dedupe as join semantics**
rather than as a grouping step someone has to remember to add:

| Resource | Granted | Universal | Result |
|---|---|---|---|
| `home` (for the anonymous principal) | ✅ | ✅ | **one row — matched, deduped** |
| `audit-access` | ✅ | ❌ | one row, universal side null |
| `profile` | ❌ | ✅ | one row, granted side null |

Every row therefore has nulls on one side unless the key matched, which is why all four output
columns are `Coalesce` — without them two-thirds of the nav renders blank.

### Verified across identities

| Acting as | Nav | Exercises |
|---|---|---|
| **Public User** | **2** ✅ | **the dedupe** — `home` granted *and* universal |
| Priya Cohen | 3 ✅ | no overlap between branches |
| Kwame Bianchi | 3 | one global grant |
| Mateo Boateng | 4 | two grants |
| Aaliyah Kowalski | 3 | a scoped grant |

`Public User` at 2 is the test the two-branch design exists to pass. `home` is granted to the
`public` role *and* flagged universal, so it arrives by both paths and must collapse.

`Nav Edit` carries correctly through the whole chain: Priya's Rulebook is editable (she ratifies
rules) while Home and Profile are read-only — a distinction that travelled from
`permissions.can_edit` through four joins, an aggregate, and a coalesce.

### Two finishing steps

- **Hide the un-coalesced source columns.** The raw `Resource Name` from the universal side remains
  visible and shows `null` on granted-only rows. Superseded by `Nav Name`.
- **Sort by `Nav Order`.** Default is insertion order — Home(0), Profile(99), Rulebook(3). Sorting
  gives Home, Rulebook, Profile, which is what `Sort Order` and Profile's 99 exist for.

## ⭐ Step 16 — the gated page: the empty room, built and verified

**Built:** an `Audit & Access` tab carrying three elements plus an explanation.

```
Resolution ─filter [Resource Key] = "audit-access"─▶ Audit Gate   (1 row or 0)
Sessions    ──INNER JOIN on 1 = 1──▶ Audit Trail
Assignments ──INNER JOIN on 1 = 1──▶ Access Grants
```

`Audit Gate` is the acting user's grant reduced to at most one row. The two audit elements inner-join
to it, so when the grant is absent the join matches nothing and the tab renders empty — the rows were
never in the result set.

### The gate is a scalar existence check, not a row-level join

The obvious move is to join the trail to the gate on `User Id`. It is wrong. `sessions` has no
`User Id` (it has `Acting As`), but that is not the real problem: joining on the acting user means the
auditor sees **only their own** sessions. An auditor's authority is to see *everyone's* activity.
Joining on identity silently converts "do you have audit authority" into "rows belonging to you."

Hence the constant key. Both sides join on the literal `1`.

### The join key must be a formula, not a calculated column

First attempt: add a `Gate Key = 1` column to each element, join on it. **The join editor reads the
*source* element's columns, not the child element's**, so a calculated column added to the child never
appears in the key dropdown.

The fix is the join editor's own **Add formula** option on each side of the key, with the literal `1`.
Sigma then reports `Type mismatch between number and text` until *both* sides are converted — the
error names the problem precisely and is worth reading rather than clicking past.

### This inner join is a deliberate exception to standing rule 3

"All resolution joins LEFT" exists for **diagnosis**: a multi-source inner join returns `0 rows`
identically no matter which source failed, so it destroys the evidence. Here `0 rows` **is the intended
output** — it is the enforcement, not a dead end. The rule inverts for gates. Anyone tidying this file
later will want to "fix" the inner join; don't.

### ⭐ Publishing snapshots the control's current value — and ships it to every viewer

**This shipped an access-control hole to the public link, and only the anonymous read caught it.**

The identity control has no separate *default value* setting. Whatever it is set to at the moment you
publish becomes what every viewer gets. Testing was done acting as Kwame; publishing in that state made
**Kwame the acting identity for every anonymous visitor**, so the audit trail — the one page in the
workbook that is supposed to be gated — was open to anyone with the link.

In the editor everything looked correct. `Resolution` resolved, the gate opened and closed on cue, the
counts matched the oracle. The defect existed only in the published copy.

| | |
|---|---|
| **Symptom** | `Audit Gate` = 1 row for the anonymous principal, showing Kwame's assignment |
| **Cause** | control value at publish time is the shipped default |
| **Fix** | reset the control to `Public User` (nil UUID), republish |
| **Caught by** | reading the public URL signed out — invisible everywhere else |

Sharper statement of standing rule 1: it is not only that *the editor shows your session*, it is that
**your session state becomes the shipped default.** Reset every control before publishing.

### Publish and "Make app public" are two separate steps

`Publish` promotes the draft to the published copy. The published copy does **not** become the version
visitors see until **Make app public** is clicked as well. Between the two, the gallery still serves the
previous version — the new page was live and simultaneously invisible, which reads exactly like a
failed publish.

Related: **the editable source and the published copy have different workbook IDs.**

```
edit:      /edit-workbook?workbook=5ADg2gsZ705wTtnZSm31Na
published: /view-workbook?workbook=2PKJk4ZoUqLEksgSHHicKN
```

Feeding a published ID to `/edit-workbook` returns **403 on `create-embed`** and renders a blank editor
chrome with no error. The draft/published split is not only a data-layer phenomenon; the two are
distinct objects in the URL space.

### Reader-facing navigation is the tabbed container, not workbook pages

Built first as a **workbook page**, which was wrong. The published viewer exposes **no page tabs** —
the seven "pages" readers see are tabs in `Tabbed container 1` on Page 1. A workbook page is reachable
only via a hand-wired navigation button (which is how `Resolution Rebuild` is reached, and the reason
it is one broken button away from being stranded).

So the page was published, live, correct — and unreachable by any viewer.

**Moving elements between the two:** `Move to` lists only *pages*, never tabs. The route is two steps —
`Move to → Page 1`, then drag the element into the tab panel. Joins, lineage and element names all
survive the move; recreating them would not (standing rule 5).

### Verified anonymously

Signed out, on the public URL:

| Acting as | `Audit Gate` | `Audit Trail` | `Access Grants` |
|---|---|---|---|
| **Public User** (shipped default) | **0** | **0** | **0** |
| **Kwame Bianchi** | 1 | 8 | 7 |
| **Mateo Boateng** | 0 | 0 | 0 |
| Priya Cohen *(editor only)* | 0 | 0 | 0 |

`Audit Trail` reads 8 rather than the seeded 3 because `Sessions` accumulated during testing — correct,
and the point of the scalar gate: the auditor sees every session, not their own.

### Two recurrences worth noting

**The sign-in modal fires when an anonymous viewer switches identity.** Step 13's behaviour — the write
action on the control — and the guard conditioned on the anonymous constant is not suppressing it. The
switch still takes effect underneath; only the session write is blocked. It lands on the first
interaction a visitor tries, so it is worth revisiting.

**The lazy-render trap cost time again.** `Audit Trail` and `Access Grants` sat at `Loading row count…`
with `No data` until the viewport was made taller, then resolved to 8 and 7. A viewport too short
produces the same silence as a missing element — and the same silence as the failure this lab was
built to find.

## ⭐ Step 17 — the Assistant denies a capability it has

**Asked** whether it could read a mermaid ERD uploaded as a PNG, the Sigma Assistant answered:

> I cannot read or interpret images, including PNG files of mermaid diagrams. I don't have vision or
> image analysis capabilities—I can only work with text-based content.

The image was attached anyway. It read it correctly — the full authorization path through the
junction table, `null = global` on the scope relationship, `granted_by`/`granted_at` identified as
audit fields, `sessions.acting_as` separated from the authorization core — and matched the diagram
against the input tables already in the workbook.

Full quotes and the reading in
[`evidence/2026-07-26-assistant-image-capability.md`](evidence/2026-07-26-assistant-image-capability.md).
Captured from pasted replies rather than observed live, so it is weaker evidence than the Step 9
transcript, and it is marked as such.

### It inverts the Step 9 practical rule

Step 9 concluded: *ask it what it could and couldn't see; it answers accurately.* That was true for
**provenance** — it correctly said it had not observed the join configuration and was inferring. It
is false for **capability**. Those are different claims:

| Claim | Reliable here? |
|---|---|
| "I inferred this rather than observed it" | ✅ accurate |
| "I cannot do X" | ❌ wrong, and nothing surfaced it |

The Step 9 file has been amended in place rather than left to mislead.

### The quiet failure mode

Over-claiming a capability yields a broken result you notice. **Under-claiming yields a capability
you never use** — no error, no empty grid, no failed publish, just a path not taken on the model's
own advice. This test nearly did not happen.

It is the only failure in this repo whose artifact is *absence*, which makes it the hardest one to
catch by inspection — the discipline that catches everything else here.

### Same shape as Step 9, opposite direction

| | Prose | Artifact / behaviour |
|---|---|---|
| Step 9 | accurate hedge — "likely", "conceptual" | hedge lost; INNER recorded where LEFT was used |
| Step 17 | inaccurate — "I don't have vision" | read the diagram correctly |

**The prose is not the evidence.** Neither difference was visible without checking the thing itself.

### The ERD itself

`docs/erd/rbac-erd.mmd` is generated from `datapackage.json`, not drawn by hand, so it cannot drift
from the schema it documents; `rbac-erd.png` is that source rendered for surfaces that take an image
but not a file. Ten foreign keys, primary keys, types and nullability all carry through.

## ⭐ Step 18 — a schema built from a picture, relationships and all

**Given** `docs/erd/rbac-erd.png` and nothing else — no CSVs, no `datapackage.json`, no DDL, no
column list — the Assistant built ten tables with **every column count exact**, then wired the
relationships as four join elements.

Full detail in
[`evidence/2026-07-26-assistant-erd-to-tables.md`](evidence/2026-07-26-assistant-erd-to-tables.md).
Both workbooks were read directly in the browser, so this is observed rather than reported.

### The test that separates reading from guessing

Seven of the ten foreign keys share a name with the key they reference, so any column-name matcher
finds them. **Three cannot be found that way**, and they are the discriminator:

| Edge | Why name-matching misses it | Result |
|---|---|---|
| `assignments.granted_by → users.user_id` | column isn't called `user_id` | ✅ wired |
| `sessions.acting_as → users.user_id` | no name overlap at all | ✅ wired |
| `assignments.scope_id` nullable | *optional* is drawn, not named | ⚠️ see below |

`Assignments Complete` reports `ASSIGNMENTS + 4` and carries **two** references to `users` —
`User Name` beside a qualified `User Name (USERS)`, holding different people per row: Frank Miller's
grant issued by Kate Thomas. That is `granted_by` joined as a second reference to the same table.
`Sessions Complete` returns user identity against a session event, which is only reachable through
`acting_as`.

**Nothing in the column names says a grant records who issued it.** It read that off a line in a
raster image.

### Where it substituted its own convention

It read `null = global` correctly and then **designed the null away** — inventing an explicit
`Global Scope` row with `scope_type: global` and pointing every assignment at a real scope. No nulls,
so the LEFT-join requirement never arises. Same meaning, different mechanism.

Second instance in the same build: `Permissions Complete` collapses `can_view`/`can_edit` into one
`Access Level` enum of `Edit`/`View` — which cannot express a grant that is neither.

Both are defensible modelling decisions. Neither was flagged.

### The pattern, now consistent across findings

| | Reproduced faithfully | Silently re-decided |
|---|---|---|
| Step 9 — generated SQL | join path, keys, scopes LEFT, output | INNER for LEFT; filter into `WHERE` |
| Step 18 — ERD to tables | entities, attributes, all ten relationships | null-encoding; two booleans to one enum |

**It understands the model; it does not preserve your decisions about how to express it.** Whether
that matters depends on whether the expression was load-bearing — and in an authorization model, the
null-versus-sentinel choice is exactly the kind that is.

### One defect worth its own line

Column naming came back **inconsistent between tables in a single build** — `Department ID` and
`User Name` in Title Case beside `platform_role_id`, `role_key`, `acting_as` in snake_case, from a
source that was snake_case throughout. The prettified ones read `ID` where this repo reads `Id`, so
**neither convention matches `data/*.csv`**: loading the real fixtures needs a remap first, and
nothing surfaces that until the load fails.

## Step 19 — the oracle was wrong: fixture drift, one cell

**Found while re-comparing the Assistant's build against ours.** Both the hand-built `Resolution` and
the Assistant's chain returned **8 rows**; `expected/resolution.csv` said **9**. Two independent
builds agreeing with each other and disagreeing with the oracle points at the data, not the logic.

It was one field. `data/assignments.csv` carried Liam Patel's grant (`9e99f22d…`, Site 214) as
`active`; the workbook has it **`revoked`** — deliberately, as the Step 5 filter test, evidenced by
`2026-07-25-step5-revoked-anonymous.png`. The workbook was changed to exercise the status filter and
**the fixture was never updated to match**.

Fixed by setting that row to `revoked` and rebuilding:

| Fixture | Before | After | Workbook |
|---|---|---|---|
| `resolution` | 9 | **8** | 8 ✅ |
| `nav` | 20 | 17 | — |
| `roster` | 5 | 4 | 5 pre-filter → **4 tiles** ✅ |
| `join_assignments_permissions` | 9 | 9 | unfiltered by status, unchanged |

`roster` dropping to 4 is **not** a second divergence. The roster query excludes system accounts by
design — *"you cannot log in as the anonymous principal"* — so its output models the **login tiles**,
while the workbook's `Login Roster` element at 5 is the superset before that filter. Both correct,
measuring different things.

### Why this one matters more than its size

The oracle is the thing every other check is made against. A fixture that silently disagrees with the
workbook doesn't fail loudly — it makes every future diff off by one row, and the natural reading of
that is *"the Sigma build is wrong"*. The discipline was inverted for a day: the reference was the
broken side.

**A test fixture is not exempt from the rule it enforces.** Change the workbook to exercise a case,
change the fixture in the same commit — or the oracle stops being an oracle.

Also worth noting: `data/*.csv` are **CRLF**. An anchored `sed 's/,active$/,revoked/'` silently
matches nothing, because the line ends `,active\r`. It reports success and changes zero rows.

### Addendum — the 9 → 8 in the Assistant's chain is the same revoked grant

Comparing the two builds, the Assistant's staging chain visibly loses a row:

```
Assignments Source            7 rows
Assignments-Permissions Join  9 rows   (role fan-out: 1+2+1+2+1+1+1)
With Resources Join           9 rows
With Scopes Join              9 rows
With Users Join               8 rows   <- one row disappears here
```

It disappears at the **users INNER join**, which is exactly where Step 9 predicts an inner join would
silently drop a row. It is not that.

Checked rather than assumed:

- **Liam Patel is present in the workbook's `users`** — `a6d9a334…`, Account Executive, Sales, found
  with *Find in table* on `User Directory`, 1 of 1. An inner join on `user_id` has nothing to drop.
- **`With Users Join` carries one filter: `Status` = `active`.** Read off the element's filter panel.

So both chains lose the same row for the same reason — Liam's revoked grant — and the difference in
join types costs nothing here.

**Worth stating plainly:** the INNER-versus-LEFT finding is a claim about how the two builds would
diverge **under change**, not an observed defect. On this data they agree. Recorded so the next
person who notices `9` beside `8` doesn't re-run the investigation, and so the Step 9 argument isn't
quietly upgraded into something it hasn't earned.

### The Assistant's build has since been deleted from the workbook

Removed 2026-07-26. It had done its job: twenty elements reproducing an answer the model reaches in
one, and once the point was made they were just clutter beside the real chain, with nothing marking
which was which. Anyone opening the workbook to build on it had to work that out first.

Archived before deleting, as `HANDOFF.md` required — full element list with row and column counts in
[`evidence/2026-07-26-assistant-tab-element-inventory.md`](evidence/2026-07-26-assistant-tab-element-inventory.md),
screenshot beside it. The SQL, the join types and the filter transcript were already captured in the
Step 9 evidence files, which quote the artefacts directly rather than pointing at live elements.

Nothing else referenced them: the hand-built chain sources from the base input tables, not from the
Assistant's staging elements. `Resolution`, `Permissions` and `Assignments` all resolve unchanged
after the deletion — checked, because deletion cascades silently (standing rule 5).

## Step 20 — `My Nav`, and the stale number it exposed

**Built:** a flat element off `Nav Source` on the Navigation and Session tab. Sorted **ascending by
`Nav Order`**, with `Nav Order` and `Nav Key` hidden; shows `Nav Name` and `Nav Edit`. Deliberately
**not grouped** — grouping alphabetises, which would put Audit & Access before Home and break the
whole point of carrying `Sort Order` through four joins.

Verified across identities:

| Acting as | `My Nav` | Order |
|---|---|---|
| Public User | 2 | Home (0), Profile (99) |
| Kwame Bianchi | 5 | Home (0), Entry (1), Review Queue (2), Audit & Access (5), Profile (99) |

Public User at 2 is not a sort test — insertion order gives the same answer. **Kwame is the test:**
`Audit & Access` at 5 lands between Review Queue and Profile, which insertion order would not produce.

### The stale number

`HANDOFF.md` recorded Kwame's nav as **3**. The workbook renders **5**, and `expected/nav.csv` says
**5** as well:

```
Kwame Bianchi  home          0   universal
Kwame Bianchi  entry         1   granted
Kwame Bianchi  review-queue  2   granted
Kwame Bianchi  audit-access  5   granted
Kwame Bianchi  profile      99   universal
```

Three grants plus two universals. The oracle and the build agreed with each other all along; only the
handoff was wrong, and it had been wrong since the nav was built. Every other identity in that table
was right, which is exactly why nobody caught it.

**Rendering data in order is itself a check.** The rows were always there and always correct — but
`Nav Source` is a table you scan, and `My Nav` is a list you read. Making it legible made a
three-month-old typo obvious in a second.

## Verification technique

Read the counters from the **accessibility tree**, not from screenshots — one query returns every
element's `N rows – M columns` as exact text:

```
browser_find  regex: /\d+ rows/
```

Cheaper, unambiguous, and it does not depend on what happens to be inside the viewport.

---

## Pending

| Step | Build | Expect | Tests |
|---|---|---|---|
| 5d | Filter `[Status] = "active"` on the join | **8 rows** | filters surviving publish |
| 6 | New column `Coalesce([Scope Name], "ALL SCOPES (global)")` | 9 × 29 | **calculated column — untested** |
| 7 | Group + `Max([Can View])` / `Max([Can Edit])` | 9 rows | aggregation surviving publish |
| 8 | Identity control, defaulted to the nil UUID | — | control state surviving publish |
| 9 | Nav — union with universal resources | — | the union, and the dedup |
| 10 | **A/B: the same join built by the Sigma Assistant** | — | whether Assistant-authored elements publish |

Step 6 is the last cheap unknown in the data layer. A formula column is computed rather than
stored, and nothing yet establishes whether that survives into an anonymous session.

Step 10 tests a hypothesis worth stating plainly: the Sigma Assistant appears to build joined
tables as generated pages with table visualizations rather than through the join editor. If those
objects don't publish, it explains the original failure — and it means an element can look correct
in your session while not existing for anyone else.

## Standing rules confirmed so far

- **Verify anonymously.** The editor reflects the author's session — its data and its control values.
- **Reset every control before publishing.** Publishing snapshots current control values as the
  shipped default. Testing as a privileged identity and publishing in that state hands that identity
  to every viewer (Step 16).
- **All resolution joins LEFT.** Correctness for null scopes; diagnosis everywhere else — a
  four-way inner join returns `0 rows` identically no matter which source failed. **Exception: a
  gate.** Where `0 rows` is the intended output rather than a failure, the inner join *is* the
  enforcement (Step 16).
- **Reader-facing navigation is the tabbed container, not workbook pages.** Published viewers get no
  page tabs; a workbook page is reachable only by a hand-wired button.
- **Read the key-match panel before committing a join.** Name every unmatched key.
- **Use the qualified column name after a join** (`[Role Id (Assignments)]`).
- **Create a column with `+` before typing a formula into it.** Typing a formula onto an existing
  column severs its identity and it ends up referencing itself.

---

## Step 21 — the tenant boundary, and two ways a gate fails open

Re-themed off the interview-app data onto multi-tenant store inventory, then built the gate. The
build itself was small. What it surfaced was not.

### The keying

The inventory tables were lifted into their own files but kept text natural keys — `Store Key`,
`Sku Number`, and brand/line/family/type as repeated strings. Every other table in this repo is
GUID-keyed. Rename a brand and the joins break.

Re-keyed on `uuid5(NAMESPACE, natural_key)`. That choice does three things at once: it is
deterministic across machines, it is **additive** (a new store or brand gets a new id and leaves
every existing id untouched), and it needs no id server. Verified by simulating growth — one
appended row introducing a 4th store, a new brand and a new type/family/line branch changed
**0** existing rows across all seven tables, and the grown star still rejoined losslessly.

It also resolved a hierarchy that looked broken on text keys:

```
Product Family -> Product Type    31 distinct,  0 with multiple parents
Product Line   -> Product Family 109 distinct,  2 with multiple parents
```

Those 2 were never violations. `Security Cameras` exists under both `Cameras` and `Security`;
`Gaming Laptops` under both `Laptops` and `PC Gaming`. Two lines sharing a name, which the text key
had merged into one. Keyed on the full path: **111 lines from 109 names**, and type → family → line
is a clean tree — which is what the asset-entry form's cascading dropdowns need.

Brand is genuinely orthogonal, not a keying artifact: 63 of 178 brands span more than one line.

The normalization had existed only in a shell heredoc. For a system shipped as a template that is
the brittle part, not the schema — nobody adding a store could regenerate. It is now
`oracle/normalize.py`, with `--check` to regenerate in memory and diff against `data/`.

### Failure one: whitespace

The gate came out at 189,000 rows where the oracle said 283,500 — short by exactly 94,500, one
store's 31,500 rows × 3 resolution rows. A trailing space had been typed into one `Scope Key`.

It is a nasty shape of bug because it looks fine upstream. Abilene still matched *its own grant*
(37 chars = 37 chars, both read from the same cell), so `Visible Scopes` reported `True` for it.
Only the join to the fact table broke. The grid is canvas-rendered so the value cannot be read from
the DOM; a throwaway `Len()` column printed `37` against `36` and named the row in seconds.

**A key that is correct relative to itself can still be wrong relative to everything else.**

### Failure two: NULL meaning global

The gate read a NULL `scope_id` as "global". Blacklist logic inside a whitelist system — absence of
a restriction read as permission to see everything, so a missing or mistyped `scope_id` granted
**more** access, silently. It fails **open**.

It also could not express a third state that is entirely real: a user who holds a resource but
should see no rows — IT, a new hire, someone whose scope was withdrawn. Three intents, one NULL.

Fixed by stating intent: sentinel `scopes` rows (`global` = ALL SCOPES, `none` = NO SCOPES) and
`assignments.scope_id NOT NULL`. Proven, not asserted:

```
a 'none' grant    -> 'inventory' still in nav (1 row), 0 inventory rows visible
typo'd scope_id   -> FOREIGN KEY constraint failed
NULL scope_id     -> NOT NULL constraint failed
```

Both bad-data cases previously returned all three stores.

### The bug the fix exposed

Giving the sentinel a real name broke `nav`: 18 rows → 19. The UNION hardcoded the label
`'ALL SCOPES (global)'` in its universal branch while the granted branch read `scope_name` from
`scopes`. Once those diverged the `GROUP BY` stopped collapsing them and Public User silently gained
a second `home` row — the exact collapse case this repo documents as deliberate.

Both branches now read the label from the sentinel. **A label duplicated in two places is the same
bug as a key duplicated in two places.**

### What the numbers are

`Visible Scopes` = `Scopes` ⋈ identity-filtered `Resolution` on the literal `1`, carrying
`Resource Key`/`Can View`/`Can Edit` — resource-agnostic on purpose. `My Inventory` inner-joins the
fact table to it on `Store Id = Scope Key`. The only resource-specific string in the chain is
`"inventory"`, on the gated element, so a second gated page is a copy with one word changed.

| Acting as | `Visible Scopes` | `My Inventory` |
|---|---|---|
| Kwame (Abilene) | 9 | **31,500** |
| Priya (global) | 6 | **94,500** |

Both match `expected/scoped_inventory.csv`. Public User is predicted 0 and **has not yet been
verified anonymously** — Standing Rule 1 is not satisfied for this gate.

---

## Step 22 — the write side: a form, and everything the model had not been asked yet

Step 21 built the read gate. This step built the thing that writes, and building it exposed a series
of questions the model had never had to answer — most of them found by the user asking why, not by a
test failing.

### The dimensions were read-only, and shouldn't have been

The agreed design was "dimensions writable, facts bulk-only" — the app mints keys for rows it
creates, `normalize.py` seeds the rest. All seven tables then went in via `Data → Table → CSV`, which
creates **read-only CSV elements**. The decision was made and the opposite was built, and only one
instance of the mismatch was reported ("`products.csv` is a CSV element") as though it were the
exception rather than the rule.

Rebuilt via `Input → CSV`. **The difference is not cosmetic:** `Input → CSV` mints a second copy of
the rows, `Data → Table` on an existing element makes a live projection. Getting this backwards
later produced a 111-row "Families for Type" input table containing *lines*.

The six were verified individually — 8 / 31 / 111 / 178 / 3 / 423 — because a file-chooser race
during the batch upload could have put any CSV in any table, and a wrong-but-plausible row count is
exactly what this build keeps failing to notice.

### `data-entry` was a page governed by nothing

The form's page existed as a tab with no resource behind it, while every other page had one. Told
that "the Data Entry tab isn't a resource", the user's reply was *"data entry 100% is a resource"* —
and they were right. It was a gap, not a design choice.

Added as a resource (sort 3), granted to `store-manager` view+edit. Kwame and Mateo now have it in
nav; Aaliyah and Priya do not. `write_authority`, `store_options` and `scoped_inventory` were all
unchanged, because they key on `inventory` rather than on the page — the separation working.

**Nav still is not the boundary.** Tabs in the tabbed container are reader-facing and visible to
every viewer regardless of grants. Nav decides whether a page is *offered*; the gate decides whether
the form *exists when reached*.

### The write side: append-only, because facts are not editable

`inventory_daily` is a dated snapshot. Editing one is not data entry, it is falsifying an audit
record. So corrections are new facts:

```
on hand today = snapshot + SUM(adjustments)
```

The real motivation was a gap: the model separates `can_view` from `can_edit`, Kwame holds view+edit
on `inventory`, and **nothing in the application had ever consulted `can_edit`**. `Write Gate` makes
it load-bearing — verified 1 / 1 / 0 / 0 / 0 across the five identities, with Aaliyah the proof:
same store as Kwame, same resource, reads all 31,500 rows, cannot post.

It did not work first time. Built by duplicating `Audit Gate` and repointing the resource, the
`Can Edit` condition silently never applied — the value filter still admitted True, False *and* null,
so it passed anyone holding any inventory grant. Measured 1 / **1** / **1** / 0. Kwame reads 1
whether the gate works or not; **Aaliyah is the row that tells a working gate from a decorative one.**

### Gate the options, not the submission

The store dropdown is sourced from a child of `Visible Scopes`, not from `Stores`, so an illegal
store is never offered. Validating after the fact would mean the user was still shown a store they
should not know exists.

Asked why not simply filter on `Can Edit`, the answer turned out to be measured, not obvious:

```
Can Edit only                 5  ALL SCOPES, Abilene, Albuquerque, Alhambra, NO SCOPES
+ Is Visible                  5  (unchanged!)
+ Resource Key = "inventory"  1  Abilene
+ Scope Type = "store"        1  Abilene
```

**`Resource Key` is the load-bearing filter, not `Can Edit`.** Kwame holds `audit-access` at *global*
scope, so that row makes every scope visible and his legitimate global audit authority becomes global
inventory-write authority in the dropdown unless the resource is pinned. Authority does not transfer
between resources; a cross join makes it look like it does.

Then, reading that cumulative table, `Is Visible` was deleted as redundant — and Kwame's dropdown
immediately offered all three stores. **Cumulative testing shows when output stops changing, which
says nothing about whether an earlier condition still does work.** Leave-one-out across the whole
roster shows each of the four conditions is load-bearing for a different user, and `Scope Type` only
for a global *editor* — a shape no current user has. In a template, the condition protecting the
next user is exactly what a maintainer deletes as dead weight.

### The cascade, and the collision that proves the keying

`Families for Type` → `Lines for Family` → `Products for Line`, each a **child** of its input table —
never a duplicate, so a dimension gaining a column propagates without rework (`Lines for Family` went
111×4 → 111×5 untouched). Controls target the children, not the shared tables, so the cascade cannot
filter a table for other consumers.

The sharpest test passed: selecting `Gaming → PC Gaming → Gaming Laptops` offered MSI, ASUS ROG,
Acer Predator and Alienware — while `Computers → Laptops → Gaming Laptops` offers Razer, Lenovo
Legion, Acer Predator and Alienware. **Two lines, same name, disjoint products.** On text keys those
ten products would have been one list.

Brand is deliberately absent from the form. After Type→Family→Line a line holds 3.8 products on
average; 98.4% of line+brand pairs yield zero products; and `Product Id` determines `Brand Id`
anyway. It is displayed, never selected.

**The clear chain is not polish.** Changing `Sel-Type` clears Family, Line *and* Product directly
rather than by chaining, so a stale grandchild cannot survive an already-empty intermediate. Verified
by setting `Audio > Home Theater > Soundbars` and switching the type. Without it the form writes a
valid row for the wrong SKU — FK satisfied, data wrong.

### Rules as data: serial formats

A serial's format is a **manufacturer** convention, so the pattern lives on `brands`; an operator's
asset-tag convention is a **category** convention, so `product_lines` overrides it. Resolution is
`COALESCE(line, brand)`, NULL meaning unconstrained. Adding a rule is a row, not a deploy.

Proven to resolve rather than merely exist: `MSI-12345678` against an MSI Gaming Laptop is **rejected**
despite being a valid MSI brand serial, because the line-level `LAP-#####` override wins.

Each pattern carries an authored `Serial Hint` — *"MSI- followed by 8 digits, e.g. MSI-40218837"* —
because `^MSI-\d{8}$` is unactionable for a store manager. The example does most of the work.

67 of 423 products carry a rule and **the rest are deliberately unconstrained**. Completing the set
would mean inventing formats for 171 manufacturers whose conventions we do not know, and a wrong
pattern is worse than none.

### What Sigma would not let us do

`Set value as` offers **Control | Static values | Formula** — there is no `Column`. An action's
Formula field resolves only controls. So a column-derived value cannot reach a control, which rules
out a hidden `Sel-Pattern` control *and* an `On click` condition, since conditions are control-only
too. Sigma's enforcement primitive is the gate, and a gate empties a **table**; it cannot disable a
**button**.

So serial validation is advisory in the UI and enforced by `invalid_serial_format` in the oracle.
The tempting workaround — copying the pattern into a control so the condition can see it — would let
the user edit the rule they are validated against.

Two details worth not rediscovering: `RegexpMatch(x, null)` is a **type error**, so the `IsNull`
guard must wrap the *call*, not the result. And `Adjustment Id` uses `CallText("uuid_string")` —
Sigma's passthrough to the warehouse, i.e. Snowflake's `UUID_STRING()`.

### The insert action wrote plausible nonsense

Sigma's action auto-fill maps positionally and **re-runs on any `Into` change**. First attempt
targeted `Products` with every mapping shifted by one. Corrected, the first posted rows still wrote
the **Product Line Id** into `Product Id`, because the product control's Source column was
`Product Line Id` — the dropdown displays product *names* either way.

Every value was a well-formed UUID. Nothing errored. One row held a product *type* in `Product Id`,
a product *family* in `Adjusted By`, and a product *line* in `Reason`:

```
cfa2ea5a…  →  product_lines / "Inkjet Printers"
ce497fd3…  →  product_types / "Computers"
85c0d91f…  →  product_families / "Printers"
```

**A UUID column accepts any UUID.** This is the same failure as the trailing space in Step 21,
inverted: there the key was correct relative to itself and wrong relative to everything else; here
every key is real and every one is the wrong *kind*. The oracle catches it — a product family id is
not a user who holds write authority — which is why `invalid_adjustments` exists.

### Three integrity checks, each proven to discriminate

An always-empty check proves nothing, so each was made to fail on purpose:

| Check | Catches | Verified by |
|---|---|---|
| `invalid_adjustments` | posting outside your write scope | Mateo→Abilene (wrong tenant) **and** Aaliyah→Abilene (view-only) — *different bugs; a gate testing one passes the other* |
| `invalid_serials` | a serial against a multi-unit delta | serial on ±1 passes, on −3 and +12 caught |
| `invalid_serial_format` | serial not matching its resolved pattern | line override beats brand format |

### What is still not done

The form is not finished: the product control still writes line ids, test rows 4–8 are junk, the
input tables are `Editable in draft` so the form will silently no-op for published viewers, and the
identity control sits on Kwame.

And the oldest item on the list is still open: **nothing has been verified signed out.** Every number
in Steps 21 and 22 comes from an editor session — the exact thing Standing Rule 1 exists to distrust,
written after this workbook shipped Kwame's audit trail to the public link.

### Step 22 addendum — the reorganisation, and a redundancy heuristic that misfires

Ten elements had accumulated at Page 1 **root** — siblings of the tabbed container rather than
children of any tab — so they rendered beneath every tab's content. `Input → CSV` and `Data → Table`
place new elements on the page root, not into the active tab, and nothing in the UI signals it. The
symptom was subtle: automated sweeps kept finding `Brands` and `Product Types` regardless of which
tab was open, which read as noise rather than as a layout fact.

Tabs were renamed and the elements distributed: the six writable dimensions plus the three cascade
views and `Inventory Adjustments` to **Inventory Master Data**; the gate chain to **Scopes &
Inventory Data**. The six duplicate `*.csv` elements were deleted; `inventory_daily.csv` stays,
because `My Inventory` sources it and facts are deliberately not writable.

**Sigma's Assistant was asked which tables were unused, and its answer is worth recording as a
pattern.** It correctly identified `Login Roster` as load-bearing despite being conceptually
redundant — it sources the identity control. It then recommended removing `Access Grants` on the
grounds that it *"doesn't appear to be used as a source by any other element."*

That heuristic is right for intermediate elements and wrong for terminal ones. `Access Grants` is
one of the two tables `Audit Gate` gates — 7 rows for Kwame, 0 for everyone else. Nothing consumes
it because **the user is the consumer**; being a leaf is its purpose. Applied literally, the rule
recommends deleting every element anyone actually looks at.

It also missed the genuine duplicates — six CSV elements holding rows identical to the input tables
of the same name — apparently counting them as input tables. So the analysis inverted: it proposed
deleting a working access-control demonstration while overlooking six true copies.

The general shape is familiar from this build: **topology tells you what is connected, not what is
finished.** The same reasoning error deleted `Is Visible` from the dropdown predicate, where a
cumulative test showed the output had stopped changing and was read as proof the condition was
inert.
