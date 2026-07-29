# Sigma RBAC Lab — design

**Date:** 2026-07-24
**Status:** superseded by execution — retained as the original design record.

> This is the design as written **before** the build. Every table, join and rule below was
> subsequently built and verified; several were revised in the doing. For what was actually built
> and what it cost, read [`BUILD_LOG.md`](BUILD_LOG.md); for the findings indexed by symptom, read
> [`FIELD_GUIDE.md`](FIELD_GUIDE.md).
>
> Kept unedited so the plan and the outcome can be compared.

## Why this exists

Two goals, one build.

1. **Bisect.** Flo's app layer works when authored and collapses on the Sigma Public link. A day of
   debugging never isolated the cause because every observation moved two or three variables at
   once. Building the multi-user layer again, one element at a time, publishing and checking
   anonymously after each, makes the first red step the answer.
2. **The runbook.** Adding multi-user / role capability to a Sigma app is Peter's ground. There is
   no good written guide to it. The lab produces one, and the bisect findings become its warnings.

The runbook is the product. The working lab is the byproduct.

## What we already know

Established 2026-07-24, from direct observation rather than documentation:

| Finding | Evidence |
|---|---|
| CSV uploads render for anonymous viewers | `Users (AD)`, 500 rows, incognito |
| **Standalone input tables render for anonymous viewers** | lab workbook, 500 rows / 7 cols, incognito, verified via Playwright |
| Some input tables return placeholder rows to anonymous viewers | `Role Panel Permissions` 23→3 blank; `User Role Site Assignments` 6→3 null |
| Sigma's internal Row ID does **not** survive into the anonymous session | the failing table returned 5 columns instead of 6; `ID` was gone |
| Access level ("Editable in published version") is not the discriminator | set wide open, still blank |
| Publish state is not the discriminator | published, still blank |

The Row ID finding is load-bearing: **a key Sigma generates is metadata, and metadata is not
guaranteed to travel.** Anything joined or filtered on Row ID is unavailable in a public app, and
fails silently with nulls rather than an error. Hence GUIDs from the ground up.

## Storage matrix (Phase A, folded into the build)

| # | Variant | Status |
|---|---|---|
| V1 | CSV upload | ✅ pass |
| V2 | Input table, standalone | ✅ pass — 500 rows / 7 cols anonymous |
| V3 | Input table, linked to a source element | untested |
| V4 | Standalone input table + a **Lookup** column | untested — top suspect |
| V5 | Standalone input table + a formula column | untested |
| V6 | Join across storage types | untested |
| V7 | Restricted "editable in published version" | untested |

V4 matters most. A traditional RBAC model constantly resolves labels across tables, and Sigma
offers two primitives for that — `Lookup()` and joins. If Lookups null out anonymously while joins
survive, the whole resolution layer must be built on joins. That is a hard constraint, not a
preference, and it matches the observed signature: the junction returned rows while its
Lookup-derived `User Name` and `Role Name` came back null.

## Schema

Nine tables. Abstract vocabulary, concrete sample values. Seed data in `data/lab/`.

**Three-part identity on every entity:**

| Part | Purpose | Example |
|---|---|---|
| **GUID** | the join key — what every FK points at | `b507671c-4d38-4838-912e-02c2f1b4510b` |
| **Key** (slug) | the stable literal that formulas reference | `audit-access` |
| **Name** | display only, never keyed on | `Audit & Access` |

The slug exists because the authority check needs a legible literal. `[Resource Key] =
"audit-access"` survives a reseed and reads clearly; a hardcoded GUID literal does neither.

```
departments        Department Id · Department Key · Department Name
job_titles         Job Title Id · Job Title Key · Job Title Name · Department Id
platform_roles     Platform Role Id · Platform Role Key · Platform Role Name
users              User Id · User Name · Email · Job Title Id · Platform Role Id

roles              Role Id · Role Key · Role Name · Description
resources          Resource Id · Resource Key · Resource Name · Resource Type
                   · Sort Order · Universal · Description
scopes             Scope Id · Scope Key · Scope Name · Scope Type

assignments        Assignment Id · User Id · Role Id · Scope Id · Granted By
                   · Granted At · Status
permissions        Permission Id · Role Id · Resource Id · Can View · Can Edit
```

### Modeling decisions

**`resources`, not `panels`.** A resource is anything gated — a page, a dataset, a button, an
export. `Resource Type` says which. Sample values are pages so it stays concrete; the schema ports.

**`assignments` is an entity, not a link.** A grant is issued, revoked, possibly expires, and the
audit log must be able to name *which* grant. Hence `Assignment Id`, `Granted By`, `Granted At`,
and `Status`. Revocation is `Status = revoked`, never a deleted row — the log outlives the mistake.

**`Scope Id` blank means global.** Three of six seed assignments are global. This is the null that
an inner join silently eats, which is why the resolution layer must be LEFT.

**Job title is a child of department, keyed on the pair.** 48 of 49 titles belong to exactly one
department; "Product Designer" appears under both Design and Product. Rather than flatten it or
alter the values, `job_titles` carries 50 rows — two named "Product Designer" with different GUIDs
and different `Department Id`. Users carry only `Job Title Id`; department resolves through it.

This is a decision, not a discovery. The data cannot say whether Product Designer is one role or
two; the model asserts it. That assertion *is* the modeling. It also leaves a live name collision
in the fixture, which is the argument for GUID keys made concrete — the same reason a county map
keys on FIPS and not on "Montgomery County."

**No upstream hash.** The Sigma export's `User Id Hash` was dropped. There is no real upstream IdP
here, so carrying a vendor-specific handle into an abstract guide is noise.

### The anonymous principal

Every serious auth system names its anonymous subject — Windows `ANONYMOUS LOGON`, Unix `nobody`,
OIDC's unauthenticated principal. Doing the same here is what keeps "not logged in" from being a
special case.

```
users         Public User      00000000-0000-0000-0000-000000000000   (RFC 4122 nil UUID)
              Job Title Id  →  System Account  →  System department
roles         role-public      "public" — the unauthenticated principal
permissions   public → home    Can View TRUE, Can Edit FALSE
assignments   Public User → role-public → global scope, Granted By = nil (system-issued)
```

**This is the structural fix for the class of bug that cost 2026-07-24.** Every failure that day
traced to an empty identity control producing null comparisons — `[User Id] = null` evaluates to
null, not false, so every downstream element returned zero rows with no error. With a sentinel
principal the control is **never empty**: it defaults to the nil UUID, an anonymous visitor
resolves through exactly the same joins as everyone else, and there is no `IsNull` branch anywhere
in the resolution layer.

The nil UUID is deliberate — recognizable on sight, sorts first, and means "no identity" by
convention rather than by comment.

`System` department and `System Account` title exist so every FK stays non-null and the traversal
stays single-path. They also give the roster its filter for free: **the login roster excludes
users in the System department**, because you cannot log in as anonymous. If more service accounts
appear later, a `User Type` column is the cleaner discriminator; one system row does not earn it.

## Fixture — the cases deliberately built in

| Case | Why |
|---|---|
| Kwame holds **two roles at two scopes** (supervisor @ Site 305, IT global) | multi-role, scope-correct resolution |
| Liam is a clerk at **Site 214** | same role as Aaliyah, different scope — the scope wall |
| **Three assignments have a blank `Scope Id`** | the null an inner join eats |
| Priya is both **grantor and grantee** | self-referential FK on `users` |
| **5 granted users out of 499** | the roster must return 5; 499 means ghost users |
| `Universal` = TRUE on Home and Profile | the two-tier union; adding a role never touches them |
| "Product Designer" ×2 | name collision, GUID keys justified |

## Build sequence

Each step: build **one** thing → publish → open the public URL in an anonymous session → record row
**and column** counts. Column count matters: the failing table lost its `ID` column, which was the
tell nobody caught.

| Step | Build | Also tests |
|---|---|---|
| 0 | `users` standalone input table | ✅ done — 500 rows public |
| 1 | `departments`, `job_titles`, `platform_roles` | dimension joins |
| 2 | `roles`, `resources`, `scopes` | baseline repeat |
| 3 | `assignments` junction **+ one Lookup column** for role name | **V4** |
| 4 | `permissions` junction | booleans surviving publish |
| 5 | `resolution` — LEFT joins across assignments, permissions, resources | **V6** |
| 6 | identity control + current-user filtered clone | the control's published state |
| 7 | nav — union with universal resources | the union |

Verification is done by opening the published URL in a Playwright session, which is anonymous by
construction. The editor cannot be trusted for this: it carries the author's session data and the
author's control values, and it lied about both for an entire day.

## Standing rules

- **Junctions are standalone input tables.** Never linked. Sigma relationships express many-to-one
  and 1:1 only; the junction table *is* the M2M.
- **Key on GUIDs. Never on names, never on Row ID.** Names collide; Row ID does not travel.
- **Resolution joins are LEFT.** An inner join over four sources returns `0 rows` identically no
  matter which source went empty — no error, nothing to diagnose. LEFT returns rows with nulls in
  one column and names the culprit on sight.
- **Grants are written by clicking, not typing.** A row-click action writes the GUID via
  *Set value as = Column*. Left on Static it fires and writes nothing.
- **Platform role ≠ application role.** Sigma's `owner`/`reader` is what the tool permits. The
  `roles` table is what the app permits. Two stacked systems; never conflate them.

## Open questions

1. Does `Lookup()` resolve for anonymous viewers? Step 3 answers it. If not, the resolution layer
   is joins-only and that becomes the guide's headline warning.
2. What distinguishes the input tables that serve anonymously from those that don't? V2 passes and
   two known tables fail. Steps 3–5 should surface it.
3. Should assignment subjects become polymorphic (user *or* group), so a role can be granted to a
   department the way AD groups map to seats? Deferred — the schema tolerates it later.

## Deliverables

- `data/lab/*.csv` — seed data, GUIDs minted once and frozen
- the lab workbook on Sigma Public
- `docs/FLO_RBAC_RUNBOOK.md` — the guide, written as the steps are executed and verified
