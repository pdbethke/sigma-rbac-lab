# Handoff — state as of 2026-07-29 (updated: published, repo public, announced)

Where the build stands, what's verified, what's next, and what will bite whoever picks this up.

---

## The artifact

**Workbook:** `Test - Pls do not use - Multi-User/Role System Public debugging`
Published on Sigma Public, listed in its browsable gallery.
**Repo:** `sigma-rbac-lab` — **public** on GitHub, history squashed to a single day-zero commit
(2026-07-29). Full pre-squash history is preserved locally on `pre-squash-backup`, which must not be
pushed. Note that a force-push does not erase: orphaned objects stay reachable by direct SHA and
forks outlive the rewrite.

**Announced 2026-07-29** — the demo and two LinkedIn posts are live: the RBAC post (the Priya/Kwame
contrast, and gated options as the takeaway) and the rules-as-data post (serial patterns per brand,
overridden per line). Written up in `docs/POSTS.md`.

**Two workbook IDs — they are different objects:**

```
edit:      https://public.sigmacomputing.com/edit-workbook?workbook=5ADg2gsZ705wTtnZSm31Na
published: https://public.sigmacomputing.com/view-workbook?workbook=2PKJk4ZoUqLEksgSHHicKN
```

Feeding a published ID to `/edit-workbook` returns 403 on `create-embed` and renders blank chrome with
no error. **Publishing is two steps:** `Publish` promotes the draft; **Make app public** is what makes
that version the one visitors see. Between them the gallery still serves the previous version.

A complete application-level RBAC model running on Sigma Public's free tier, serving correctly to
unauthenticated visitors, verified at every step against a SQL oracle.

---

## Workbook structure

**These are tabs in `Tabbed container 1` on Page 1 — not workbook pages.** That distinction is
load-bearing: the published viewer exposes **no page tabs at all**, so anything built as a workbook page
is unreachable by viewers unless a navigation button points at it. All reader-facing navigation lives in
the tabbed container. The tabs are exposed as `tab` roles, so they can be walked programmatically.

Real workbook pages: `Page 1` (everything below) and `Resolution Rebuild` (reached only by a
hand-wired button — one deletion away from being stranded).

**Tabs were reorganised and renamed on 2026-07-27**, and the ten elements that had been sitting at
Page 1 *root* (siblings of the tabbed container, so they rendered under every tab) were moved into
tabs. `Input → CSV` and `Data → Table` drop new elements on the page root, not into the active tab —
that is how they ended up scattered.

```
Home · Data Entry · Reports · Audit & Security · Profile · User Management
System & Sessions · Permissions & Access · Resources · Organization
Scopes & Inventory Data · The Oracle · Inventory Master Data · Forms
```

| Tab | Elements |
|---|---|
| **Inventory Master Data** | the six writable dimensions — `Product Types` 8 · `Product Families` 31 · `Product Lines` 111 · `Brands` 178 · `Stores` 3 · `Products` 423 — plus the cascade views `Families for Type` · `Lines for Family` · `Products for Line`, and `Inventory Adjustments` 3 |
| **Scopes & Inventory Data** | `Scopes` 5 · `inventory_daily.csv` 94,500 · **`Visible Scopes`** · **`My Inventory`** · **`Inventory Postable Scopes`** |
| **Audit & Security** | `Audit Gate` · **`Write Gate`** · `Access Grants` · `Audit Trail` · explanatory text — the gated page |
| **Data Entry** | the adjustment form and its controls |
| **Forms** | empty (created during the reorganisation) |
| **User Management** | `User Directory` · `Granted Users` · `Login Roster` · `Users` |
| **Permissions & Access** | `Resolution` · `Permissions` 8 · `Assignments` 7 |
| **Resources** | `Resources` 6 |
| **Organization** | `Job Titles` 51 · `Departments` 11 · `Roles` 5 · `Platform Roles` 2 |

**The six duplicate `*.csv` elements were deleted** (2026-07-27). `inventory_daily.csv` remains and
must — `My Inventory` sources it, and facts are deliberately not writable.

**`Access Grants` was assessed as redundant by Sigma's Assistant and kept.** Its heuristic —
*"doesn't appear to be used as a source by any other element"* — is sound for intermediate elements
and misleading for terminal ones. `Access Grants` is one of the two tables `Audit Gate` gates
(7 rows for Kwame, 0 for everyone else); being a leaf is the point. `Login Roster` was flagged as
conceptually redundant and is likewise load-bearing: it sources the identity control, and the
chooser must sit outside the filter it drives.

### The gated dataset — multi-tenant store inventory

Re-themed off the interview-app data (2026-07-27) so the public version ships nothing borrowed.
Seeded by `oracle/normalize.py` from a flat 26 MB export (gitignored); every key is a UUID.

| Element | Rows × Cols | Role |
|---|---|---|
| `stores.csv` | 3×10 | the tenant boundary |
| `product_types.csv` | 8×2 | cascade level 1 |
| `product_families.csv` | 31×3 | cascade level 2 |
| `product_lines.csv` | **111**×3 | cascade level 3 |
| `brands.csv` | 178×2 | orthogonal, does **not** cascade |
| `products.csv` | 423×5 | the SKU |
| `inventory_daily.csv` | 94,500×19 | the fact table |

**`product_lines` is 111 rows for 109 distinct names.** `Security Cameras` exists under both
`Cameras` and `Security`; `Gaming Laptops` under both `Laptops` and `PC Gaming`. Keyed on the label
they merge into one row and corrupt the hierarchy; keyed on a UUID minted from the full
type/family/line path they are correctly distinct. That number is the cheapest proof the keying is
right — if it ever reads 109 again, someone re-keyed on names.

**Brand is not a level of the tree.** 63 of 178 brands span more than one line (Apple sells phones
and speakers), so its dropdown must not cascade from type/family/line.

**The Sigma Assistant's parallel build has been deleted** (2026-07-26). Twenty elements reproducing an
answer the model reaches in one, sitting beside the real chain with no way to tell which was which —
confusing for anyone trying to build on this workbook. The finding it supported is unaffected and
fully documented:

- `evidence/2026-07-25-assistant-generated-sql.md` — the generated SQL, join types, the analysis
- `evidence/2026-07-25-assistant-sql-filter-transcript.md` — the invisible-filter exchange, verbatim
- `evidence/2026-07-26-assistant-tab-element-inventory.md` — every element, row and column count,
  recorded immediately before deletion, with the screenshot beside it

### The dependency chain

```
assignments ─┬─▶ Resolution ──▶ Granted Nav ─┐
             │   (identity-filtered)          ├─▶ Nav Source ──▶ (My Nav, pending)
resources ───┴─▶ Universal Nav ───────────────┘

assignments ──▶ Granted Users ──▶ Login Roster ──▶ (Login Tiles, pending)
                                        ▲
users ⋈ job_titles ⋈ departments ──▶ User Directory

User-Id control ──filters──▶ Resolution
                ──writes───▶ Sessions

Resolution ─filter Resource Key = "audit-access"─▶ Audit Gate ─┬INNER 1=1─▶ Audit Trail   (Sessions)
                                                               └INNER 1=1─▶ Access Grants (Assignments)

Scopes ─┐
        ├─INNER 1=1─▶ Visible Scopes ─┐
Resolution ─┘         [Is Visible]     ├─INNER Store Id = Scope Key─▶ My Inventory
                                       │                              [Is In Scope]
inventory_daily.csv ───────────────────┘
```

**`Visible Scopes` is deliberately resource-agnostic.** It answers *which scopes can the acting user
see, for which resource* and carries `Resource Key`, `Can View`, `Can Edit` as columns rather than
filtering to one resource inside itself. The single resource-specific string in the whole chain is
`"inventory"`, and it lives on `My Inventory`. **A second gated page is a copy of `My Inventory`
with one word changed** — that is the property to preserve, because this ships as a template.

**`Granted Users` sources from `assignments`, not from `Resolution`** — deliberately. The chooser
must sit outside the filter it drives, or the roster shows only the person already selected.

### Scope is stated, never inferred

`assignments.scope_id` is **NOT NULL**. Global access is a sentinel row in `scopes`, not an absent
value:

| `scope_type` | Name | Means |
|---|---|---|
| `global` | ALL SCOPES | sees everything |
| `none` | NO SCOPES | **holds the resource, sees nothing** |
| `store` | *(the store)* | that store only |

The gate predicate is a positive test — `scope_type = 'global' OR store_id = scope_key`. There is no
`IsNull` anywhere in it, and that is the point.

**Do not "simplify" this back to NULL-means-global.** It was built that way and it was wrong twice
over. NULL read as global is *blacklist* logic inside a whitelist system: a missing or mistyped
`scope_id` granted **more** access, silently — it fails **open**. And it cannot express the third
state at all, because NULL is already spoken for. Proven after the change:

```
a 'none' grant    -> 'inventory' still in nav (1 row), 0 inventory rows visible
typo'd scope_id   -> FOREIGN KEY constraint failed
NULL scope_id     -> NOT NULL constraint failed
```

Both bad-data cases previously returned all three stores.

**Live in the workbook since 2026-07-27.** `Scopes` carries the two sentinel rows, all three
previously-blank grants point at ALL SCOPES, and both predicates were swapped to the positive test:

```
Visible Scopes › Is Visible
  If([Scope Type (Resolution)] = "global" or [Scope Key] = [Scope Key (Resolution)], True, False)

My Inventory › Is In Scope
  If([Resource Key] = "inventory"
     and ([Scope Type (Resolution)] = "global" or [Store Id] = [Scope Key (Resolution)]),
     True, False)
```

All five identities returned **identical numbers before and after** — Kwame 31,500, Mateo 31,500,
Aaliyah 31,500, Priya 94,500, Public User 0. That is the point: same behaviour, different failure
mode. Priya's global access now comes from an explicit sentinel rather than from a NULL being read
as "everything".

**The positive test is inherently fail-closed**, which is what makes it safe despite the constraint
below: a blank or unrecognised `Scope Type` is not `"global"`, so it falls through to the key
comparison, which a blank cannot satisfy. Deny is the default.

**Sigma cannot enforce the NOT NULL.** That constraint lives only in the SQL oracle, so the oracle
catches a bad grant but the workbook will still accept a blank `Scope Id` typed into the input
table. The workbook-side formulas must therefore carry their own guard rather than trusting the
data — treat an unrecognised scope as *deny*, never as *global*.

**The gate joins on the literal `1`, not on `User Id`** — also deliberately. Joining the trail to the
gate on identity would show an auditor only their *own* sessions; their authority is to see everyone's.
The gate is a scalar existence check. The key is defined with the join editor's **Add formula** option,
because the join editor reads the *source* element's columns and never sees a calculated column added
to the child.

---

## Verified anonymously

Read from a browser with no Sigma login:

| Element | Result |
|---|---|
| `Resolution` | **1 row** for the anonymous principal · **8** unfiltered, matching the oracle |
| `Nav Source` / `My Nav` | **2** anonymous · 3 Priya · **5** Kwame · 4 Mateo · 3 Aaliyah — matches `expected/nav.csv` |
| `Login Roster` | **5**, unchanged as identity switches |
| `Granted Users` | 5 |
| `User Directory` | 501 |
| `Sessions` | accumulating live |
| **`Audit & Access`** | **0 / 0 / 0** anonymous · **1 / 8 / 7** Kwame · 0 / 0 / 0 Mateo · 0 / 0 / 0 Priya |
| **`My Inventory`** | **31,500** Kwame · **31,500** Mateo · **94,500** Priya · **0** Public User — matches `expected/scoped_inventory.csv` |
| **`Write Gate`** | **1** Kwame · **1** Mateo · **0** Aaliyah · **0** Priya · **0** Public User — matches `expected/write_authority.csv` |
| **`Inventory Postable Scopes`** | **1** Kwame (Abilene) · **1** Mateo (Alhambra) · **0** Aaliyah · **0** Priya · **0** Public User — matches `expected/store_options.csv`. A **child** of `Visible Scopes`, never a duplicate, so the gate predicate has one definition |

**`can_edit` is now load-bearing, and Aaliyah is the proof.** She holds `inventory` at Abilene —
the same store and the same resource as Kwame — and differs from him only in `can_edit`. She reads
all 31,500 rows and is shut out of the write path. Before `Write Gate` existed, `can_edit` was
granted and never consulted.

**Gate the OPTIONS, not the submission.** The adjustment form's store dropdown is sourced from
`Visible Scopes`, not from `Stores`, so an illegal store is never offered. Validating after the fact
would mean the user was still shown a store they should not know exists, and any hole in the check
becomes a write into another tenant. If the option is not representable, there is nothing to
validate. `expected/store_options.csv` freezes what each dropdown may contain:

| User | Dropdown offers |
|---|---|
| Kwame | Abilene only |
| Mateo | Alhambra only |
| Aaliyah, Priya, Public | *(nothing — and `Write Gate` hides the form entirely)* |

Both branches are proven live: granting a globally-scoped user `can_edit` expands their dropdown to
all three stores, so the `scope_type = 'global'` branch is not dead code.

**⭐ Every condition in a gate predicate protects a different user. Test leave-one-out, across the
whole roster — never cumulatively.**

The store dropdown's predicate is four conditions, and each one is dead weight for most users:

```
Postable = [Is Visible] and [Scope Type] = "store"
           and [Resource Key] = "inventory" and [Can Edit]
```

| Condition | The ONLY users it bites for |
|---|---|
| `Is Visible` | Kwame, Mateo — store-scoped users |
| `Resource Key = "inventory"` | Kwame, Priya — who hold **global grants on other resources** |
| `Can Edit` | Aaliyah, Priya — view-only |
| `Scope Type = "store"` | a global **editor** — *a shape no current user has* |

Two ways this was actually got wrong here, both worth avoiding:

1. **Cumulative testing "proved" `Is Visible` redundant.** Adding conditions one at a time shows when
   the output stops changing, which says nothing about whether an earlier condition still does work
   once later ones are added. It was deleted on that basis and Kwame's dropdown immediately offered
   all three stores. Only leave-one-out answers the question.

2. **Per-user testing is not enough either.** `Can Edit` looks redundant if you only test Kwame;
   `Scope Type` looks redundant against every user who currently exists. The condition that protects
   the *next* user is the one a maintainer deletes as dead weight. Since this ships as a template,
   keep a user in the test set for each shape — store-scoped, global-view, global-edit, view-only,
   anonymous — even where no real person has that shape yet.

**Authority does not transfer between resources**, and a cross join makes it look like it does:
Kwame's legitimate global `audit-access` grant becomes global inventory-write authority in the
dropdown unless the resource is pinned.

**Read authority and write authority are separate questions and must not share a predicate.**
`My Inventory` asks *which rows may I see*; `Write Gate` asks *may I create one*. A gate that
answers only the first passes a view-only user straight into the form.

**Tenant isolation is proven by name, not by count.** Kwame and Mateo both read 31,500, so the row
count alone shows only that each sees *one store's worth* — it cannot show they see *different*
stores. The distinguishing evidence is `Scope Name (Resolution)` on `Visible Scopes`: acting as
Mateo every row reads `Big Buys Flagship - Alhambra`, acting as Kwame every row reads
`Big Buys Flagship - Abilene`. The oracle agrees on value — Abilene $3,585,291,060.85 vs Alhambra
$3,296,384,492.81. When two fixtures share a number, find the column that differs.

For Public User, `My Inventory` renders **"No data"** — the empty room, reached because there is no
`inventory` grant at all rather than because a scope failed to match.

Still verified only in the **editor session**. Standing Rule 1 is not satisfied until this is read
from the published URL, signed out.

`Audit Trail` reads 8 rather than the seeded 3 because `Sessions` accumulates — correct, and the point
of the scalar gate: the auditor sees every session, not their own.

**The number that matters:** `Nav Source` = 2 for the anonymous principal. `home` is granted to the
`public` role **and** flagged universal, so it arrives through both branches and collapses. That
case is in the fixture on purpose.

---

## What's left

| | Notes |
|---|---|
| **⚠ UNPUBLISHED DRAFT — open** | As of 2026-07-27 the `Publish` button is **enabled**: the tab reorganisation, the six deletions, the Store-control fix, `Editable in published version`, the serial hint columns and the cleaned adjustment rows are all **draft-only**. The header reads **Make app public**, so visitors still see an older version |
| **⚠ Identity control sits on Mateo** | Publishing snapshots it as the shipped default. Reset to **Public User** *before* Publish — this workbook already shipped Kwame's audit trail to the public link once |
| **Verify signed out** | Still nothing checked anonymously. Standing Rule 1 unsatisfied for every number in Steps 21–22 |
| **Post a real adjustment** | Then reconcile `data/inventory_adjustments.csv`, re-run the oracle, and confirm `invalid_adjustments` / `invalid_serials` / `invalid_serial_format` all stay 0. **Note the form can no longer be tested in the editor** — `Inventory Adjustments` is now *Editable in published version*, so draft writes are off |
| **Cascading dropdowns** | Recipe below. `expected/product_cascade.csv` freezes what each level should offer |
| ~~`My Nav`~~ | **DONE** — flat element off `Nav Source` on the Navigation and Session tab, sorted ascending by `Nav Order` with `Nav Order` and `Nav Key` hidden, showing `Nav Name` + `Nav Edit`. Not grouped, deliberately: grouping alphabetises and would break the ordering |
| ~~Gated page~~ | **DONE** — `Audit & Access` tab, verified anonymously. Remaining polish: hide the redundant `Gate Key` column on `Audit Trail` (superseded by the in-join formula key), move the explanatory text above the tables, hide `Audit Gate` itself once it's no longer being demonstrated |
| **Reground the agent** | currently grounded on the full model, so it will answer about anyone. Ground it on a user-scoped proxy — scoping the data is control, instructing the agent is cover |
| **Session read side** | `Persisted As` = latest row per session key, untested against the seeded fixture (`seed+example@example.com` → should resolve to Kwame / audit-access) |
| **`Current Page`** | column exists in `Sessions`, never wired |

### Publication checklist — the demo and both posts went live 2026-07-29

**Confirm the first item below actually shipped.** It was open when the announcement went out, and it
is the only one a reader can see.


- ~~**Swap the 500 sample emails to `example.com`.**~~ **DONE.** Swapped in `data/users.csv` (500) and
  `docs/evidence/2026-07-25-step4-join-output.csv` (8). GUIDs untouched; oracle rebuilt and `expected/`
  is byte-identical, so every fixture and count still holds. **The platform constant
  `sigma.public+viewer0000000000@sigmacomputing.com` is deliberately left alone throughout the docs** —
  it's a Sigma-side fact, not sample data.
- **⭐ The published workbook still serves the original `@sigmacomputing.com` sample emails**, because
  its CSVs were uploaded before the swap above. The repo is clean; the public artifact is not. Five
  hundred invented employees with fabricated addresses at a real company's domain, carrying job titles
  and access grants, is the one thing here most likely to draw an objection — and it is the page a
  reader lands on. **Fix: `Replace CSV` on the `Users` input table with `data/users.csv`.** A menu
  operation, so it drives cleanly. GUIDs are untouched by the swap, so every fixture and count holds.
- **Rename the workbook.** "Test - Pls do not use" is the page title, the browser tab, and the link
  preview anywhere it gets shared.
- ~~**Git history** contains two pseudonymous account handles.~~ **DONE** 2026-07-29. Squashed 99
  commits to a single day-zero commit and force-pushed; the tree was verified byte-identical first.
  Note that orphaned objects stay reachable by direct SHA on GitHub after a force-push, and forks
  outlive it — squashing is not erasure. Full history is preserved locally on `pre-squash-backup`,
  which must not be pushed.
- Fill remaining doc gaps: warehouse views (`SIGDS_` schemas aren't directly queryable), the
  proxy doctrine, automation notes.

---

## Scope: this is an RBAC demonstration, not a login system

**Decided 2026-07-28.** The release ships the **identity switcher** and the home screen. There is no
login plane, and that is a boundary rather than a gap.

The lab demonstrates **authorization** — who may see which rows, hold which capability, reach which
page. It does not demonstrate **authentication**, and on Sigma Public it could not: every anonymous
viewer shares one `CurrentUserEmail()` constant, so any login screen would be a switcher in costume.
Showing the switcher plainly states what it is.

Dropping it also retires three problems that were never going to resolve on this tier:

- `Login Tiles` — the tile action never fired; "Set value as" defaults to Static rather than Column
- Switching identity as an anonymous viewer raises the *"Build with Sigma Public"* sign-in modal
- The `Sessions` write is refused for anonymous viewers at any permission level

**State plainly in the published version that the write side is inert for anonymous visitors.**
Input tables reject their writes regardless of grants, so the public app demonstrates the read gate —
nav, scoped inventory, the empty rooms — while the adjustment form is visible and cannot be
submitted. That is a complete story if it is declared, and a bug report if it is discovered.

`Login Roster` and `Sessions` stay: the roster sources the switcher, and the sessions table is the
audit trail's subject.

## Session detection — anonymous vs known viewer

**Verified 2026-07-28 in a private window.** `CurrentUserEmail()` returns
`sigma.public+viewer0000000000@sigmacomputing.com` for an anonymous viewer — the constant already
documented, now observed rather than assumed.

The check is a **grouped one-row element**, `Viewer` — grouping on a session constant collapses to a
single row because the value is identical for every row:

```
Is Anonymous = StartsWith(CurrentUserEmail(), "sigma.public+viewer")
```

**Do not try to resolve the viewer against `Users`.** Sigma's platform identity and this model's
principals are deliberately separate — the switcher is how you become a user, and no real viewer will
ever appear in `Users`. A `Lookup` on `CurrentUserEmail()` against `Users/Email` answers a question
this application does not ask, and it fails for the editor too: an editing session reports
`edit+<uuid>@sigmacomputing.com`, which is in no table, so the author would be treated as a guest and
locked out of their own form.

Three shapes observed:

```
sigma.public+viewer0000000000@sigmacomputing.com   anonymous viewer
edit+<uuid>@sigmacomputing.com                     editor session
(a real address)                                   a signed-in Sigma user
```

`StartsWith` on the first is the whole test: prefix rather than equality, since only one anonymous
session has been observed and the trailing digits may vary per viewer.

**A control cannot carry this value — and cannot carry any session-derived value.** Two independent
reasons, both fatal:

1. **Setting a control is itself sign-in-gated for anonymous viewers.** Populating one via an action
   fires the *"Build with Sigma Public"* modal precisely when the answer is "yes, anonymous" — the
   detection breaks for the only case it exists to detect.
2. **Publish freezes control values.** A control sourced from the computed column *does* populate in
   the editor, but publishing snapshots whatever the author had — `False` — and ships it to every
   visitor. Guests would be treated as signed in, writes attempted, modal fired.

So read it from the element at each use site — **the scalar-fetch pattern**, which is the general
answer to "how do I get one value" in a model with no scalar type:

```
Viewer  =  child of any table, grouped on CurrentUserEmail()   -- a session constant groups to 1 row
             Is Anonymous = StartsWith(CurrentUserEmail(), "sigma.public+viewer")
             K            = 1                                   -- constant key; there is no "row 1"

Lookup([Viewer/Is Anonymous], 1, [Viewer/K])                    -- read it anywhere
```

The literal `1` on both sides makes the join an **existence fetch** rather than a relationship — the
same device as gating on `1 = 1`. A column computes per render; a control is a shipped default.

**Generalise it: anything an anonymous viewer must see has to be derived, not stored.** Same reason
the gates empty tables rather than disabling buttons, and the same reason `Sessions` cannot log a
guest. The read path is the only one that works for them — and it is also why publishing with the
identity control on a real user shipped that user's scope to everyone. Not a footgun; the definition
of what a control is.

**It also fixes the sign-in modal.** Open since Step 13: switching identity as an anonymous viewer
raised the *"Build with Sigma Public"* dialog on the first interaction. The cause was never the
switch — it was the **`Sessions` write attached to it**. An anonymous viewer cannot write to an input
table, and the attempt is what summons the modal. Gate the write on `not [Is Anonymous]` and nothing
is attempted, so nothing prompts.

A guest can now switch identities and browse the entire demo without being asked to sign up, which
matters more than it sounds: a sign-in wall on the first click loses most visitors before they see
anything at all.

**This is a session capability, not an authorization.** Three independent questions, none
substituting for another:

| | Question | Mechanism |
|---|---|---|
| 1 | Can this session write at all? | `Viewer Is Known` — and the platform refuses anonymous writes regardless |
| 2 | May this identity write? | `Write Gate` — `can_edit` on `inventory` |
| 3 | Where may they write? | `Inventory Postable Scopes` — scope |

A signed-in Aaliyah passes 1 and must still fail 2. An anonymous Kwame passes 2 and 3 and must still
fail 1. Gate write **attempts** on 1 so the app stops trying what the platform will refuse — do not
let it stand in for 2 or 3, or signing in becomes sufficient.

**Describe these columns in the workbook** (`Set description…`), not only here. A maintainer who
finds an unexplained calc deletes it; the repo docs are not open when they do. The same applies to
`Is Visible`, `Is In Scope` and `Postable` — the four columns most likely to be tidied away by
someone who does not know what they hold up.

## The redirect gate — identity switching without leaving the page

**Built and working 2026-07-28.** Switching identity keeps you on the current page if the incoming
user may view it, and sends you Home if not.

On the identity control's `On change`:

```
condition:  IsNull(Lookup([Nav Source/Nav Name], [Current-Resource], [Nav Source/Nav Key]))
actions:    1. navigate to Home
            2. Set control value → Current-Resource → "home"
```

`Current-Resource` is a text control holding the **resource key** (`audit-access`, not
`Audit & Access`) — set by each nav button as it navigates. Matching a key against `Nav Name` returns
null for everything and looks exactly like a broken lookup.

**An action can navigate to a tab.** This was the open question that would have forced a redesign
onto separate workbook pages; it does not.

**Why it matters more than a redirect normally would:** it lets a viewer stand on one page and flip
identities to watch the same screen change, rather than being bounced home each time. Sitting on
Inventory and switching Kwame → Mateo → Priya gives 31,500 → 31,500 → 94,500, and Mateo's low-stock
list has 15 items where Kwame's has none — two managers, same screen, different work. Then switching
to Priya from Data Entry redirects, because she holds global *view* on inventory and no edit
anywhere. The whole RBAC story in about six clicks with no narration.

**Still open: direct arrival.** The redirect fires on identity *change*. A guest who lands as Public
User and clicks straight into `Data Entry` never triggers it. Either the same check has to run on tab
entry, or the reader-facing tabs need splitting from the model tabs across two workbook pages —
viewers get no page navigation, so a second page is genuinely backstage.

## Platform-agnostic by design

**Authority comes from the model, never from the platform account.** `platform_roles` is recorded as
a user attribute and is **never consulted for access** — nothing in `Resolution`, the gates or the
nav reads it.

That is the reason several things in this build look the way they do:

- **The identity switcher works at all.** Identity here is a *data value* (`User Id`), not the
  authenticated session. Acting as someone is a selection, not an impersonation.
- **`CurrentUserEmail()` is used only to detect anonymity**, never to authorize. It answers "can this
  session write", not "who is this and what may they do".
- **Do not resolve viewers against `Users`.** It would couple the model to platform identity, which
  is precisely what the design avoids — and no real viewer appears in that table anyway.

Aaliyah is a platform `owner` and the least privileged user in the application: no Data Entry, no
audit trail, no write anywhere. That is not an inversion worth remarking on — it is the two layers
being independent by construction.

**Consequence for portability:** nothing in the authorization path depends on Sigma. The same
`assignments → permissions → resources → scopes` resolution would run against any host, which is
what makes this a template rather than a Sigma trick.

## Agent scoping — absence, not refusal

The agent is grounded **only on gated elements**, so it inherits the same authority as every other
consumer of the model. This is a headline claim of the artifact, not an implementation detail.

```
Resolution · Nav Source · My Nav          what they hold, what they can reach
Current Inventory                          their stock, labels resolved by lookup
My Adjustments                             their adjustments        (to build)
Inventory Postable Scopes                  where they may post
Write Gate · Audit Gate                    their capabilities
Audit Trail · Access Grants                gate-joined — empty unless they hold audit access
```

**Everything else is dropped, including reference data.** `Products`, `Brands`, `Stores`, `Users`,
`Roles`, `Departments` — all of it. `Current Inventory` resolves `Product Name`, `Sku Number` and
`Store Name` through lookups, so readable rows arrive *through* the gate rather than alongside it.
The moment `Stores` is in scope the agent can enumerate tenants it cannot read, and the
demonstration degrades from "it cannot see" to "it knows but will not say".

**The distinction the demo exists to show:**

| | |
|---|---|
| **Refusal** | the agent has the data and declines. One clever prompt from failing |
| **Absence** | the rows were never in the result set. Nothing to decline, nothing to jailbreak |

As Mateo, *"what is the inventory at Abilene?"* is not answered with "I am not permitted" — Abilene
does not exist in anything the agent can see. The same question as Kwame returns 31,500 rows.

**No AI-specific rules were written.** The agent reads the same `Resolution` and `Visible Scopes` as
the tables and the nav. It cannot drift from the model because it has no separate copy of the
policy — which is the argument for putting authority in data rather than in prompts.

**Accept the consequence deliberately:** it cannot answer general catalogue questions. *"What
products do we sell?"* is unanswerable, because the agent knows only what the acting user's scope
contains. That is correct here, and it is what makes the claim real.

**Instruction is cover, data is control.** The prior grounding listed 33 sources with an instruction
to "answer questions about the user currently selected" — the instruction was a request and the
sources were the capability. Acting as Mateo it could read every store's adjustments, all 501 users
and everyone's sessions.

## Standing rules

1. **Verify in three sessions** — anonymous, authenticated non-owner, owner. Owner-only testing
   proves nothing; the owner sees everything by construction.
2. **The editor reflects your session**, not what a viewer sees. Publish and read the public URL.
   Sharper: **your session state becomes the shipped default** — see rule 8.
3. **All resolution joins LEFT.** A multi-source inner join returns `0 rows` identically no matter
   which source failed. **Exception: a gate**, where `0 rows` is the intended output and the inner
   join *is* the enforcement.
4. **Read the key-match panel before committing a join.** Name every unmatched key — but a bare
   `null` on the left side of a LEFT join may be structural rather than real.
5. **Extend elements; don't delete and recreate.** Deletion silently breaks children, control value
   sources and action targets.
6. **Create a column with `+` before typing a formula into it.**
7. **Name every element at creation.** Both tangles in this build trace to elements existing
   unnamed or misnamed while something got wired to them. Reinforced 2026-07-27: a second element
   called `Resolution` made the picker ambiguous, a control target bound to it, the element was
   deleted, and the target kept its label while filtering **nothing** — `Resolution` served 11 rows
   to every identity and the nav showed all six pages to Public User. Removing and re-adding the
   target fixed it. **A control target that points at a deleted element does not error.**
8. **Reset every control before publishing.** Publishing snapshots current control values as the
   shipped default; there is no separate default-value setting. This is not cosmetic — see the
   gotcha below.
9. **Change the workbook and the fixture in the same commit.** A test case added to the workbook
   without updating `data/` leaves the oracle disagreeing with reality, and every later diff reads
   as though Sigma is wrong. Cost a day (Step 19).
10. **Build reader-facing surfaces as tabs in the tabbed container**, never as workbook pages.
11. **State intent; never infer it from absence.** A NULL that means "unrestricted" fails open and
    steals a value you will later need for "restricted to nothing". Sentinel rows, `NOT NULL`.
12. **One writer per table.** `normalize.py` *seeds* keys; tables the app can append to are Sigma
    input tables where Sigma mints the UUID. Two key sources for one table means duplicate rows
    under different ids and joins that fail quietly.
13. **Never duplicate a literal that two branches must agree on.** The nav UNION hardcoded a scope
    label in one branch and read it from `scopes` in the other; the moment they diverged the UNION
    stopped collapsing and silently duplicated a row (Step 21). A label duplicated in two places is
    the same bug as a key duplicated in two places.

---

## Gotchas that cost the most time

| | |
|---|---|
| **⭐ Publishing ships whatever the control was set to** | Tested acting as Kwame, published in that state → **every anonymous visitor inherited Kwame and the gated audit trail was open to the public link.** Invisible in the editor; caught only by reading the public URL signed out. Reset controls before publishing |
| **Publish ≠ public** | `Publish` promotes the draft; **Make app public** is what makes that version the one visitors see. In between, the new work is live and invisible — which reads exactly like a failed publish |
| **A page ≠ a tab** | Workbook pages have no navigation in the published viewer. Built as a page, the gated content was live, correct, and unreachable. `Move to` lists only pages — moving into a tab is `Move to → Page 1`, then drag into the tab panel |
| **Data entry permission decides which copy you edit** | "Editable in draft" writes to a draft copy that never reaches published |
| **`CurrentUserEmail()` never returns a real address here** | and **every anonymous viewer shares one constant** — unusable as an RLS key for them |
| **A write action on a control** | makes that control sign-in-gated for anonymous viewers. Condition it on the anonymous constant |
| **Transient blank state after publishing** | an input table can render with row count intact and no values, then resolve. Republish and re-read before diagnosing |

---

## Testing

**A throwaway non-owner Sigma Public account exists** for the authenticated-non-owner session.
Credential deliberately not in this repo.

**The oracle** (`python3 oracle/build.py`) rebuilds `oracle/rbac.db` from `data/*.csv` and refreshes
`expected/`. Every Sigma element has a known-correct answer to diff against — that is what made the
step-by-step verification possible.

**Automation notes:** row counts come from the accessibility tree (`\\d+ rows?` — note the singular,
Sigma writes "1 row"), but **cell values do not** — the data grid exposes no per-cell nodes, so
reading values needs a screenshot and driving the grid needs coordinate input. A viewport too short
to render the whole page produces the same silence as a missing element. Both mistakes were made
here, more than once.

**⭐ Resize the viewport to ~1400x1500 before driving the editor.** The `Input`, `Controls` and
`Data` palettes render at y≈1080–1290. In a 980px-tall window they sit **below the fold** and clicks
on them fail silently — which reads exactly like "the palette rejects synthetic clicks." It does
not. This produced a wrong conclusion that was written into these docs before it was caught, and it
is the same viewport trap already noted above, in a new costume.

**⭐ The grid cannot be driven — coordinate input is not a workaround, it is the trap.**
A synthetic double-click on an input-table cell does **not** open the cell editor; it selects the
whole column while looking like nothing happened. Keystrokes then land on the column header: a
`Ctrl+A` + type sequence aimed at three cells instead **renamed `Scope Id` and deleted `Scope Key`**.
Eight `Ctrl+Z` restored it, including the column type change. Right-click is no better — on a row
number it returns the page-level *"Paste element"* menu, so rows cannot be deleted either.
Everything reachable through a **menu** works fine (Replace CSV, Change column type). Cell edits and
row deletes are hands-on-keyboard work: state the values and hand them to the operator.
Same family as the `Login Tiles` action, which an overlay blocks the same way.

---

## Still unexplained

**The failure that motivated this lab has not been reproduced.** Every structural theory was
eliminated: input tables publish, joins publish, filters publish, calculated columns publish,
grouping publishes, controls publish, agents publish, SQL-backed elements publish. One candidate
reproduction was retracted when the blank state turned out to be transient.

The nearest documented mechanism remains the draft-versus-published data split, which produces the
right symptom — headers present, values absent — but was never demonstrated as the cause.


---

## Build spec — the gated adjustment form

`Inventory Postable Scopes` and `Write Gate` are built and verified. What remains:

### 1. Repoint the store control

| Field | Value |
|---|---|
| Value source | `Inventory Postable Scopes` |
| Source column | **`Scope Key`** — the store's UUID |
| Display column | `Scope Name` |

`Source column` is the trap: `Scope Id` is the scope row's own id. Choosing it looks fine in the
dropdown and fails later as adjustments that match no store.

### 2. The cascade — all **children**, never duplicates

| Element | Source | Filter |
|---|---|---|
| `Families for Type` | `Product Families` | `Product Type Id` = `Sel-Type` |
| `Lines for Family` | `Product Lines` | `Product Family Id` = `Sel-Family` |
| `Products for Line` | `Products` | `Product Line Id` = `Sel-Line` |

Controls: `Sel-Type` ← `Product Types`, `Sel-Family` ← `Families for Type`, `Sel-Line` ←
`Lines for Family`, `Sel-Product` ← `Products for Line`, `Sel-Brand` ← `Brands` (**no cascade** —
63 of 178 brands span more than one line).

**Value column is always the UUID, display always the name.** Two distinct lines are both named
`Security Cameras`; a name-valued control is ambiguous exactly where it matters.

**Products are deliberately NOT scope-filtered.** They are global reference data — any store may
stock any SKU. The store is the only gated dimension. (If the SKU list should instead be limited to
what a store actually carries, that is a join to `inventory_daily` filtered by the selected store —
a different decision, worth making deliberately rather than by accident.)

### 3. Hide the form for view-only users

**`data-entry` is a resource** (added 2026-07-27, sort 3, granted to `store-manager` view+edit).
Every other page is one; the form's page was governed by nothing, which was a gap in the model, not
a design choice. Kwame and Mateo now have it in nav; Aaliyah and Priya do not.

**That does not remove the need for the gate.** Tabs in the tabbed container are reader-facing and
visible to every viewer regardless of grants — that is *why* all reader-facing navigation lives
there. Nav decides whether the page is **offered**; the gate decides whether the form **exists when
reached**. Same split as `Audit & Access`, where the page is in Kwame's nav *and* the tables are
gated, so arriving without authority gives an empty room rather than a hidden door.

It also creates a third state worth keeping: a user with `data-entry` but without
`inventory.can_edit` reaches the form and finds the store dropdown empty. That is the honest
behaviour — the form is reachable, and there is nowhere they may post.

Inner-join the form container's driving element to `Write Gate` on the literal `1`. Zero rows on the
gate means zero rows downstream, so the form is not rendered — Standing Rule 3's exception, where
the inner join *is* the enforcement. Aaliyah must not see the form at all.

### 4. The insert action → `Inventory Adjustments`

| Column | Source |
|---|---|
| `Adjustment Id` | Formula: `CallText("uuid_string")` |
| `Store Id` | `Sel-Store` (= `Scope Key`) |
| `Product Id` | `Sel-Product` |
| `Adjusted By` | the identity control's `User Id` |
| `Adjusted At` | now |
| `Units Delta` | `In-Delta` |
| `Reason` | `In-Reason` |
| `Serial Number` | `In-Serial` — **leave empty unless `|delta| = 1`** |

**SKU is displayed, never stored.** `Product Id` determines `Sku Number` (0 ambiguous of 423), so
storing it would duplicate a derived value — the same mistake as storing type/family/line, and the
thing that turns a stale cascade into a data bug. Show it beside the chosen product for confirmation.

**A serial number is different: it is genuinely new data**, naming one physical *unit* rather than a
product. It is therefore only coherent when `|units_delta| = 1` — three units have three serials, and
a serial against a 12-unit receipt asserts something false about which unit moved. SQLite cannot
express that as a constraint the CSV loader would honour, so `invalid_serials` asserts it. Verified
to discriminate rather than merely stay empty: serial on ±1 passes, bulk without a serial passes,
serial on −3 or +12 is caught.

**`Adjustment Id` = `CallText("uuid_string")`.** `CallText` passes through to the warehouse, so this
is Snowflake's `UUID_STRING()`. It keeps `adjustment_id` NOT NULL and avoids a split identity scheme
where seeded rows carry a uuid5 and app-written rows carry nothing. Note the dependency: it is a
warehouse function, so it holds on Sigma Public's Snowflake connection and would need checking on
any other platform.

**`Adjusted By` must come from the control, not from a text input.** A self-reported author makes
the audit trail worthless, and `invalid_adjustments` would not catch it — that query trusts
`adjusted_by`.

### 4b. The clear chain — **built and verified**

Changing a parent clears every descendant, not just the next one down:

| On change of | Clears |
|---|---|
| `Sel-Type` | Family, Line, Product |
| `Sel-Family` | Line, Product |
| `Sel-Line` | Product |

Verified by setting `Audio > Home Theater > Soundbars` and switching the type to `Computers` —
Family, Line and Product all reset to *Select value* in one step.

**Test it by changing a parent AFTER choosing a leaf.** Filling the form top-down never exercises
the stale path, the same way testing only Kwame never exercised `Can Edit`.

**Clear directly to every descendant, not by chaining.** If `Sel-Type` only cleared `Sel-Family`
and relied on that to clear `Sel-Line`, a stale grandchild would survive whenever the intermediate
control was already empty — no change event, no clear.

This is the failure mode that writes a valid row for the wrong SKU: referential integrity holds,
the FK is satisfied, and the adjustment lands against a product the user was no longer looking at.

### 4c. Serial format rules — data, not formulas

A serial's format is a **manufacturer** convention, so the pattern lives on `brands`. An operator's
own asset-tag convention is a **category** convention, so `product_lines` can override it. Resolution
is most-specific-first:

```
COALESCE(product_lines.serial_pattern, brands.serial_pattern)   -- NULL = unconstrained
```

Adding a rule is therefore **a row, not a deploy** — which is the point. 67 of 423 products
currently carry one: 55 inherited from the brand, 12 overridden at line level.

Verified to resolve rather than merely exist:

| Posted | Result |
|---|---|
| MSI laptop, `LAP-00123` — matches the LINE rule | accepted |
| MSI laptop, `MSI-12345678` — valid MSI *brand* format | **rejected** — the line override wins |
| Apple, `ABCDEF123456` — matches the BRAND rule | accepted |
| Apple, `nope` | **rejected** |
| brand with no rule, `~~~~` | accepted — unconstrained |

**No control is needed for the pattern.** `Product Id` determines `Brand Id` and `Product Line Id`,
so choosing a product resolves the rule automatically.

**This is a data-quality aid, not an access control**, and it deliberately fails open: a product
with no rule at either level accepts anything. That is acceptable *only* because a wrong serial
mislabels a unit — it does not grant anyone access to another tenant. Do not reuse this pattern for
anything that gates data.

**Sigma side — built and verified.** `Products for Line` carries a `Serial Pattern` column:

```
Coalesce(
  Lookup([Product Lines/Serial Pattern], [Product Line Id], [Product Lines/Product Line Id]),
  Lookup([Brands/Serial Pattern],        [Brand Id],        [Brands/Brand Id])
)
```

`Lookup` reaches the other elements — `Products for Line` holds only ids, so the patterns cannot be
referenced directly. Order is the rule: line first, brand second, `Coalesce` taking the first
non-null. Measured distribution matches the oracle exactly:

| Pattern | Rows | |
|---|---|---|
| `^[A-Z0-9]{12}$` | 18 | Apple + ASUS |
| `^[A-Z0-9]{11}$` | 15 | Samsung |
| `^LAP-\d{5}$` | **12** | **line override** |
| `^\d{10}[A-Z]{2}$` | 7 | Logitech |
| `^[A-Z]{2}-[A-Z0-9]{8}$` | 6 | Lenovo |
| `^MSI-\d{8}$` | 5 | MSI |
| `^[A-Z0-9]{7}$` | 4 | Dell |
| *null* | 356 | unconstrained |

67 constrained + 356 unconstrained = 423. Then validate with
`RegexpMatch([In-Serial], [Serial Pattern])` — the flo trick, with the regex arriving from the row
rather than written into the formula.

**Do not leave a value-list filter on `Products for Line`.** Such a filter enumerates the values
present when it was created, so a brand pattern added later may not be included and those products
would silently vanish from the cascade. One was created while inspecting the distribution and must
be removed.

### 4d. Serial validation IS enforced — in the action condition

**Corrected 2026-07-27.** This section previously stated that serial validation could not block the
submit button. That was asserted rather than tested, and it is wrong.

**`Lookup` resolves inside an action *condition*.** The submit button reaches the column directly:

```
IsNotNull([Scope-Key]) and IsNotNull([Sel-Type]) and IsNotNull([Sel-Family])
and IsNotNull([Sel-Line]) and IsNotNull([Product-Id])
and IsNotNull([In-Delta]) and IsNotNull([In-Reason])
and Lookup([Products for Line/Serial Valid], [Product-Id], [Products for Line/Product Id])
```

Key on **`Product-Id`**, not on the serial — `Serial Valid` is identified by product; the serial is
an input to it, not its key.

| Context | `Lookup` |
|---|---|
| Column on an element | resolves |
| **Text element** | **resolves** — a caption can pull from another element |
| An action's **condition** | **resolves** |
| An action's **value** formula (`Set value as → Formula`) | returns empty, no error |
| `Set value as` source options | Control / Static / Formula — no `Column` |

Only the value formula is the exception. The usual cause of a "Lookup doesn't work" is not context
but **argument order** — `Lookup(return-this, key-in-this-context, matching-key-on-target)`. Pointing
the third argument at a *label* column returns null silently: `"profile"` never equals `"Profile"`,
and it is indistinguishable from a context failure until you check the arguments.

The first and third hold; they were over-generalised into "an action cannot see a column", which is
false for conditions. So the format check is **enforcement**, and `invalid_serial_format` is a
backstop rather than the only defence.

The validity column still lives on the element, because that is where both operands resolve:

```
Serial Valid = If(IsNull([Serial Pattern]), True,
                  Coalesce(RegexpMatch(Text([In-Serial]), [Serial Pattern]), False))
```

on `Products for Line`, reached from the condition by `Lookup`, and surfaced as text beside the field
so the user is told *why* the button will not fire.

**Never show the regex to a user.** `^[A-Z0-9]{12}$` is machine-facing and unactionable. Every
pattern has a `Serial Hint` authored beside it, resolved by the same COALESCE, and the message reads:

```
Serial Message = If(IsNull([Serial Pattern]), "",
                    If([Serial Valid], "✓ looks right", "✗ " & [Serial Hint]))
```

→ *"✗ MSI- followed by 8 digits, e.g. MSI-40218837"*

The **example** carries most of the weight — people copy the sample rather than parse the sentence.
The hint is authored, not generated from the regex: a generated description would be brittle and
worse-worded, and authoring both together means whoever adds a rule states what it means.

**Most products have no rule, and that is correct — do not fill them in.** 7 brands and 3 lines carry
a pattern; 356 of 423 products are unconstrained. Completing the set would mean inventing serial
formats for 171 manufacturers whose conventions we do not know, and a wrong pattern is worse than no
pattern: it rejects valid serials and teaches users the check is noise. Add a rule only when the real
format is known.

**Note a distinction the model does not currently make.** A null pattern means *"any serial is
acceptable"*. It does not mean *"this product is not serialised"*. If that difference ever matters,
it needs its own flag rather than overloading the null — the same mistake `scope_id` made when one
NULL carried both "global" and "none".

**`&` coerces null to an empty string**, so `Coalesce("Format: " & Lookup(...), "no rule")` never
reaches its fallback — the concat yields `"Format: "`, which is non-null. Branch on the lookup:
`If(IsNull(Lookup(...)), "Any serial format accepted", "Format: " & Lookup(...))`. Same lesson as
`RegexpMatch(x, null)`: guard the call, not the result.

**Do not fake it** by duplicating the pattern into a control so the condition can see it — the user
could then edit the rule they are being validated against, which is worse than a warning. The
`IsNull` guard is on the *call*, not the result: `RegexpMatch(x, null)` is a type error, so
`Coalesce` around the outside is too late.

```
expected/store_options.csv       Kwame -> Abilene only, Mateo -> Alhambra only, others empty
expected/write_authority.csv     only Kwame and Mateo reach the form
expected/product_cascade.csv     Accessories > Cables  =  4 lines, 19 products, 12 brands
expected/invalid_adjustments.csv MUST stay 0 rows after posting a test adjustment
expected/invalid_serials.csv     MUST stay 0 -- a serial against a multi-unit delta
```

Post one adjustment as Kwame, then re-run `python3 oracle/build.py` with that row added to
`data/inventory_adjustments.csv` (Standing Rule 9 — workbook and fixture in the same commit).
`invalid_adjustments` returning anything is a privilege-escalation bug, not a data-quality warning.

---

## Recipe — cascading dropdowns for the asset entry form

Not built yet, but drivable — see the viewport note in *Automation notes*.

**Not the `Hierarchy` control.** That is a drill-down picker — it selects a *level* to view, not a
value to save. An entry form needs List controls whose sources narrow each other.

The cascade is three List controls, each sourced from an element filtered by the control above it.
Brand is a fourth, independent control — it must **not** cascade, because 63 of 178 brands span more
than one line.

| # | Build | Value / Display |
|---|---|---|
| 1 | Control `Sel-Type`, source `product_types.csv` | `Product Type Id` / `Product Type Name` |
| 2 | Element `Families for Type` = `product_families.csv` filtered `[Product Type Id] = [Sel-Type]` | — |
| 3 | Control `Sel-Family`, source `Families for Type` | `Product Family Id` / `Product Family Name` |
| 4 | Element `Lines for Family` = `product_lines.csv` filtered `[Product Family Id] = [Sel-Family]` | — |
| 5 | Control `Sel-Line`, source `Lines for Family` | `Product Line Id` / `Product Line Name` |
| 6 | Control `Sel-Brand`, source `brands.csv` — **no filter** | `Brand Id` / `Brand Name` |

**Value column is always the UUID, display is always the name.** The form writes the id; the human
reads the label. This is the same discipline as the tenant boundary, and for the same reason — two
lines legitimately share the name `Security Cameras`, so a name-valued control would be ambiguous
at exactly the point it matters.

### Verifying it

`expected/product_cascade.csv` has one row per (type, family) with `lines_offered`,
`products_offered` and `brands_offered`. Pick a type in `Sel-Type`, and `Families for Type` must
show the family count for that type; pick a family and `Lines for Family` must match
`lines_offered`. Spot-check `Accessories → Cables`: **4 lines, 19 products, 12 brands**.

### The write path

The form saves to `Products`, an **input table**, so Sigma mints the new `Product Id` (Standing
Rule 12 — `normalize.py` seeds keys, Sigma owns minting for app-added rows). The four controls
supply `Product Line Id` and `Brand Id`; `Sku Number` and `Product Name` are text inputs.

**All six dimensions are input tables** (`Product Types` 8, `Product Families` 31, `Product Lines`
111, `Brands` 178, `Stores` 3, `Products` 423 — each verified against the oracle). They were first
built as CSV elements by mistake, which made every one of them read-only and silently contradicted
the writable-dimensions decision; they were rebuilt via **Input → CSV**, not Data → Table → CSV.
`inventory_daily` stays a CSV element deliberately — 94,500 fact rows are bulk-loaded, never typed.

**The original `*.csv` elements are duplicates of the input tables and should go.** They were
created by `Data → Table → CSV` before the writable-dimensions decision, and the input tables built
later by `Input → CSV` supersede them. Two elements holding the same 31 family rows is exactly the
drift this model is built to avoid.

| Delete | Keep |
|---|---|
| `stores.csv`, `products.csv`, `product_types.csv`, `product_families.csv`, `product_lines.csv`, `brands.csv` | the six **input tables** of the same name |
| `tBIG_BUYS_INVENTORY` — raw pre-normalisation upload, no children | |
| | **`inventory_daily.csv` — `My Inventory` sources it, and facts are deliberately not writable** |

**Cascade views are children, never input tables.** `Input → CSV` mints a second copy of the rows;
`Data → Table` with an existing element as source makes a live projection that cannot drift.

**⚠ `Families for Type` at 111 rows was the `Product Lines` input table, renamed.** Not a
mis-built new element — the actual lines dimension, wearing a different name. It was nearly deleted
as "a duplicate with the wrong data", which would have destroyed the writable lines dimension.

The tell was the row count agreeing with the wrong table: 111 is lines, families are 31. A renamed
element keeps its data, its id and its children, so nothing looks broken — the name simply stops
describing the contents, and every later decision is made against the wrong mental model.

**Renaming a COLUMN is safe** (Sigma references by internal id, so formulas and joins survive).
**Renaming an ELEMENT to repurpose it is not** — it silently reassigns identity in your head but not
in the workbook. Create a new element instead; a rename is free, a lost input table is not.
