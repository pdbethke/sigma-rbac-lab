# Building a schema from a picture

2026-07-26. The Sigma Assistant was given [`docs/erd/rbac-erd.png`](../erd/rbac-erd.png) — the
rendered mermaid ERD, **image only**. No CSVs, no `datapackage.json`, no DDL, no column list. It was
asked to build the tables, and then, separately, the relationships.

**Provenance:** both workbooks were read directly in the browser by the author of this file — row
counts, column names and join configuration observed, not reported. Stronger evidence than
[the image-capability transcript](2026-07-26-assistant-image-capability.md), which was reconstructed
from pasted replies.

| Stage | Workbook |
|---|---|
| Tables only | `7ELVW8RD2edKdw4apJ27BT` |
| Tables + relationships | `183oqTkgZ8StPDZOEHfUus` |

---

## Stage 1 — the tables

Ten tables, every column count exact:

| Table | Columns built | ERD |
|---|---|---|
| DEPARTMENTS | 3 | 3 ✅ |
| JOB_TITLES | 4 | 4 ✅ |
| PLATFORM_ROLES | 3 | 3 ✅ |
| USERS | 5 | 5 ✅ |
| ROLES | 4 | 4 ✅ |
| SCOPES | 4 | 4 ✅ |
| RESOURCES | 7 | 7 ✅ |
| ASSIGNMENTS | 7 | 7 ✅ |
| PERMISSIONS | 5 | 5 ✅ |
| SESSIONS | 5 | 5 ✅ |

Entity and attribute structure recovered from a raster image without error.

### The one defect: naming is inconsistent between tables

| Title Case | snake_case |
|---|---|
| `Department ID`, `Department Key`, `Department Name` | `platform_role_id`, `platform_role_key` |
| `User ID`, `User Name`, `Email` | `role_id`, `role_key`, `role_name`, `description` |
| `Resource ID`, `Resource Key`, `Resource Type` | `scope_id`, `scope_key`, `scope_name` |
| `Permission ID`, `Role ID`, `Can View` | `assignment_id`, `user_id`, `granted_by` |
| | `session_event_id`, `acting_as`, `updated_at` |

The ERD was snake_case throughout. It prettified some tables and left others verbatim, **within a
single build**, with no rule visible in the output. And the prettified ones read `ID` where this
repo's CSVs read `Id`, so **neither convention matches `data/*.csv`** — loading the real fixtures
would require remapping column names first, a problem that stays invisible until the load fails.

## Stage 2 — the relationships

Four join elements, plus invented seed data (11 users, 5 departments, 15 assignments, all
`@example.com`).

| Element | Shape | Joins |
|---|---|---|
| `Users Complete` | 11 × 6 | users → job_titles → departments, → platform_roles |
| `Assignments Complete` | 15 × 10 | **ASSIGNMENTS + 4** |
| `Permissions Complete` | 20 × 5 | permissions → roles → resources |
| `Sessions Complete` | 5 × 7 | sessions → users |

`Users Complete` reaches `departments`, which is only reachable **transitively** through
`job_titles`. That alone is more than adjacency.

## The test that distinguishes reading from guessing

Seven of the ten foreign keys share a name with the key they point at — `department_id`,
`job_title_id`, `platform_role_id`, `user_id`, `role_id`, `scope_id`, `resource_id`. Any
column-name matcher finds those without understanding anything.

**Three cannot be found that way:**

| Edge | Why name-matching misses it |
|---|---|
| `assignments.granted_by → users.user_id` | the column is not called `user_id` |
| `sessions.acting_as → users.user_id` | no name overlap whatsoever |
| `assignments.scope_id` **nullable** | the name matches; *optional* is drawn, not named |

### Result: it wired both name-invisible edges

**`granted_by`** — `Assignments Complete` carries two separate references to `users`. Alongside
`User Name` / `Email` sits a second qualified set, `User ID (USERS)` / `User Name (USERS)`, holding
different people in the same row: Frank Miller's grant issued by Kate Thomas, Bob Smith's by Alice
Johnson. `ASSIGNMENTS + 4` is exactly the four foreign keys this repo declares on `assignments` —
user, role, scope, and **granted_by as a second join to the same table**.

**`acting_as`** — `Sessions Complete` returns `User ID`, `User Name`, `Email` against the session
event. The only path there is `acting_as → users.user_id`.

Nothing in the column names says a grant records *who issued it*, or that a session records *who it
acts as*. Both are semantic reads of a line on a diagram.

## The third tell went somewhere more interesting

It read `null = global` correctly — and then **designed the null away**. Rather than leaving
`scope_id` empty for global grants, it invented an explicit scope row named `Global Scope` with
`scope_type: global`, and pointed every assignment at a real scope.

So in its model there are no nulls in `scope_id`, and the LEFT-join requirement never arises. It
reproduced the *meaning* — global grants exist and are distinguishable — while replacing the
*mechanism* this repo uses to encode it.

That is not a misreading. Encoding "applies to everything" as a sentinel row rather than a null is a
defensible normalization, and arguably the cleaner of the two. But it is a substantive modelling
decision, taken silently, and it changes the join semantics the rest of the model has to be built
against.

A second instance in the same build: `Permissions Complete` collapses `can_view` / `can_edit` into a
single `Access Level` column of `Edit` / `View` — again a semantic re-modelling rather than a copy,
and again one that discards a distinction (`can_edit` implies `can_view`; a single enum cannot
express a grant that is neither).

## Verified against an independent SQL oracle

The claims above rest on the workbook's own arithmetic. So the base tables were read out of the
workbook, rebuilt in SQLite, and the resolution run independently — the same discipline the rest of
this repo applies to its own build.

Input: 5 users, 4 roles, 5 scopes, 4 resources, 5 assignments, 9 permissions, transcribed from the
published workbook (`1W1wI0dNbHhA9mko9E0ont`).

**Oracle: 11 rows. Workbook: 11 rows. Agreement row for row.**

| User | Role | Scope | Resources reached | Oracle | Workbook |
|---|---|---|---|---|---|
| Alice Johnson | Editor | Engineering Org | Sales Dashboard, Financial Report | 2 | 2 ✅ |
| Bob Smith | Administrator | Global | + Customer Database | 3 | 3 ✅ |
| Carol Davis | Viewer | Sales Org | Sales Dashboard, Financial Report | 2 | 2 ✅ |
| David Lee | Editor | Sales Org | Sales Dashboard, Financial Report | 2 | 2 ✅ |
| Emma Wilson | Analyst | Project Alpha | Sales Dashboard, Financial Report | 2 | 2 ✅ |

Scope names and types match per row — Bob's grant resolves `Global`/`global`, Carol's and David's
`Sales Org`/`organization`, Alice's `Engineering Org`, Emma's `Project Alpha`/`project`. The
view/edit pattern matches too: only the Administrator role reaches `res-003`, because it holds the
sole permission row against it; Viewer and Analyst get view without edit.

**From a picture and two prompts, it produced a schema whose resolved output is provably correct
against a second engine.**

Two limits on what that proves:

- It validates **the joins and the resolution**, not the modelling decisions. The `Global Scope`
  sentinel and the `Access Level` collapse are still substitutions — they simply do not produce wrong
  answers *on this data*.
- `res-004` (Marketing Workbook) has no permission rows at all, so it is unreachable by every user.
  Oracle and workbook agree on that, but it means the fixture never exercises a case where all four
  resources are in play.

## What this establishes

**Given only a raster image, it recovered relationships that column names cannot express.** That is
a stronger result than the Step 9 reproduction, where it could observe the tables it was copying.
Here the entire structure came through a picture.

**And where the diagram documented a convention, it substituted its own.** Nulls became a sentinel
row; two booleans became one enum. Both changes are reasonable; neither was flagged.

The pattern across all three findings in this repo is now consistent:

| | Reproduced faithfully | Silently re-decided |
|---|---|---|
| Step 9 — generated SQL | join path, keys, scopes LEFT, output | INNER for LEFT; filter into `WHERE` |
| Step 18 — ERD to tables | entities, attributes, all ten relationships | null-encoding; two booleans to one enum |

**It understands the model. It does not preserve your decisions about how to express it.** Whether
that is a feature depends entirely on whether the expression was load-bearing — and in an
authorization model, the null-versus-sentinel choice is exactly the kind that is.
