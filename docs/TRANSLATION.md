# RBAC, both ways: Flask/SQL ↔ Sigma

Two audiences, one model.

If you've built authorization in Flask, Django, or Rails, you know this schema cold and you're
here to find out how to express it in a BI tool. If you know Sigma and have never had to design an
authorization model, you're here for the other column. The model is genuinely the same. The
**enforcement point** is not, and that difference is the one worth reading carefully.

## The model is portable

Nine tables. This is the SQL you'd write behind Flask; the CSVs in `data/` are the same tables.

```sql
CREATE TABLE departments (
    department_id    TEXT PRIMARY KEY,      -- GUID
    department_key   TEXT UNIQUE NOT NULL,  -- stable slug, for literals
    department_name  TEXT NOT NULL          -- display only
);

CREATE TABLE job_titles (
    job_title_id     TEXT PRIMARY KEY,
    job_title_key    TEXT UNIQUE NOT NULL,
    job_title_name   TEXT NOT NULL,
    department_id    TEXT NOT NULL REFERENCES departments
);

CREATE TABLE users (
    user_id          TEXT PRIMARY KEY,      -- '000...0' = the anonymous principal
    user_name        TEXT NOT NULL,
    email            TEXT,
    job_title_id     TEXT NOT NULL REFERENCES job_titles,
    platform_role_id TEXT NOT NULL REFERENCES platform_roles
);

CREATE TABLE roles (
    role_id          TEXT PRIMARY KEY,
    role_key         TEXT UNIQUE NOT NULL,
    role_name        TEXT NOT NULL,
    description      TEXT
);

CREATE TABLE resources (
    resource_id      TEXT PRIMARY KEY,
    resource_key     TEXT UNIQUE NOT NULL,  -- what your code checks against
    resource_name    TEXT NOT NULL,
    resource_type    TEXT NOT NULL,         -- page | dataset | action | export
    sort_order       INTEGER,
    universal        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE scopes (
    scope_id         TEXT PRIMARY KEY,
    scope_key        TEXT UNIQUE NOT NULL,
    scope_name       TEXT NOT NULL,
    scope_type       TEXT NOT NULL          -- site | region | tenant | department
);

CREATE TABLE assignments (            -- the M2M junction; a grant is an ENTITY
    assignment_id    TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users,
    role_id          TEXT NOT NULL REFERENCES roles,
    scope_id         TEXT     NULL REFERENCES scopes,   -- NULL = global
    granted_by       TEXT NOT NULL REFERENCES users,
    granted_at       TIMESTAMP NOT NULL,
    status           TEXT NOT NULL DEFAULT 'active'     -- revoke, never delete
);

CREATE TABLE permissions (
    permission_id    TEXT PRIMARY KEY,
    role_id          TEXT NOT NULL REFERENCES roles,
    resource_id      TEXT NOT NULL REFERENCES resources,
    can_view         BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit         BOOLEAN NOT NULL DEFAULT FALSE,

    -- the flags are not orthogonal: edit implies view
    CHECK (NOT can_edit OR can_view)
);
```

### `can_edit` implies `can_view` — and only SQL can enforce it

The two flags do different jobs:

| | Gates |
|---|---|
| `can_view` | **presence** — whether the resource appears in the navigation at all |
| `can_edit` | **behaviour** — whether the page is read-only once you are on it |

Because presence *is* the view grant, downstream surfaces only need to carry `can_edit`. A resource
that reached the resolution for a given user is one they hold a permission on; re-checking
`can_view` when rendering the nav tests the same thing twice.

Which makes `can_edit = TRUE, can_view = FALSE` incoherent: a resource the user may modify but will
never see. It would be absent from their navigation while still granting write access to anything
that checks `can_edit` directly.

**In Postgres that is a one-line `CHECK` constraint** and the database refuses the row. **Sigma has
no equivalent** — an input table will accept the combination, and it is exactly the shape a
permissions UI with two independent checkboxes produces on its first day.

> Where the relational version enforces an invariant, the Sigma version can only document it.
> Enforce it in whatever writes the row — a validation on the grant action, or a check element that
> surfaces violations — because nothing else will.

Three things a developer should notice, because they carry over exactly:

**`scope_id` is nullable and NULL means global.** A common source of quietly-wrong authorization in
both platforms: an inner join to `scopes` drops every global grant, and the query still returns rows,
so nothing looks amiss. Use a LEFT join.

**A grant is an entity, not a link.** It has `granted_by`, `granted_at`, and `status`. Revocation
sets `status = 'revoked'`; it does not delete the row. The audit log has to be able to name a grant
that no longer applies.

**Three-part identity.** GUID to join on, `_key` slug for your code to reference as a literal, name
for display. `resource_key = 'audit-access'` is what a decorator checks; a hardcoded GUID is not
reviewable and a display name is not unique. The fixture ships with two job titles both named
"Product Designer" precisely so this stops being theoretical.

## The resolution query

Effective permissions for one user. This is the whole authorization engine.

```sql
SELECT  r.resource_key,
        r.resource_name,
        COALESCE(s.scope_name, 'ALL SCOPES (global)') AS scope,
        MAX(p.can_view) AS can_view,
        MAX(p.can_edit) AS can_edit
FROM        assignments a
JOIN        permissions p ON p.role_id     = a.role_id
JOIN        resources   r ON r.resource_id = p.resource_id
LEFT JOIN   scopes      s ON s.scope_id    = a.scope_id     -- LEFT: NULL scope = global
WHERE       a.user_id = :current_user
  AND       a.status  = 'active'
GROUP BY    r.resource_key, r.resource_name, scope;
```

`MAX()` over booleans is a logical OR — if a user holds two roles and either one grants edit, they
get edit. Sigma spells this `Max([Can Edit])` and it behaves identically. Union of grants, never
intersection: two roles can only ever *add* capability.

## The mapping

| Concept | Flask / SQL | Sigma |
|---|---|---|
| Identity of the caller | `session["user_id"]`, JWT `sub` | a **control** holding `User Id`, defaulted to the nil UUID |
| Anonymous caller | `AnonymousUser`, `nobody` | `Public User` at `000…0`, holding the `public` role |
| Many-to-many | junction table | junction as a **standalone input table** — Sigma relationships express many-to-one and 1:1 only |
| Resolution | the query above | the join editor, join type **LEFT** |
| "OR across roles" | `MAX(can_edit)` | `Max([Can Edit])` |
| Filter to current user | `WHERE user_id = :current` | the control **targeting** the element |
| Row-level security | `WHERE` clause on the query | filter the **source** element, not the display |
| Effective-permissions view | a `VIEW` or a service method | a child element (`resolution`) |
| Per-user view | parameterised query | a filtered **clone** of that element |
| Universal resources | `WHERE universal = TRUE` unioned in | a `UNION` with the universal rows |
| Grant a role | `INSERT INTO assignments` | a row-click **action**, *Set value as = Column* |
| Revoke | `UPDATE … SET status='revoked'` | same — an update action, never a delete |
| Audit | append-only table | append-only input table |
| **Route guard** | `@requires_permission("audit")` | **does not exist** |

## Where the mapping breaks

**In a Flask app you can gate the route. In Sigma you can only gate the data.**

This is the one that catches every developer coming from a web framework. Your instinct is the
decorator:

```python
@app.route("/audit")
@requires_permission("audit-access")
def audit():
    ...
```

The request never reaches the handler. The template never renders. The data never leaves the
server.

Sigma has no equivalent. Pages are client-rendered UI; hiding a tab, or conditionally showing an
element, is **cover, not control** — Sigma's own documentation says if/else logic is not a security
feature and should not be used to enforce access control. A hidden tab is a door with a curtain
over it.

The enforcement is the data:

```
Don't:  hide the Audit page unless role = 'IT'
Do:     filter the audit elements by the caller's resolved authority
```

Get that right and a clerk who navigates to the audit page finds **an empty room** — not a locked
door, not an error, just nothing to see, because the rows were never in her result set. Same
posture as row-level security in a database: the query returns what she's allowed to have, and the
UI is only ever a rendering of that.

Corollary for anything AI-facing: scope the model's **grounding data**, don't instruct it to
behave. An in-prompt authorization check is cover too.

## Writes: the habit that ports badly

`Model.objects.filter(pk=x).update(field=y)` is cheap on Postgres and is the wrong shape here. This
is the assumption most worth unlearning when arriving from Django or Rails.

### The storage underneath is immutable

Sigma runs on a columnar warehouse. **Snowflake never updates in place** — an `UPDATE` rewrites
micro-partitions and the old ones persist, which is precisely why Time Travel exists. Immutable
storage with a current-state view over it.

**And Sigma is already doing this for you.** From Sigma's documentation:

> *"For every input table, Sigma also creates a separate **edit log** (write-ahead log/WAL) to
> ensure data durability, consistency, and recovery."*

Every `Update row` action you fire is **already recorded as an append-only event** underneath. The
platform keeps the ledger regardless. The only question is whether you can query it — and you
can't, because it lives in a `SIGDS_` schema that is not directly queryable.

| Approach | You get | The log |
|---|---|---|
| `Update row` | the familiar abstraction | kept by the platform, unreadable by you |
| `Insert` + derive current | the same current state, one query away | **yours, in a table you can join against** |

Appending is not a workaround. It is the shape the storage already has — you are surfacing a
pattern that exists one layer down.

### There is no upsert

`Update row` requires the row to exist, and a session's first event is exactly when it doesn't. Real
upsert costs two conditional actions and a lookup evaluated twice, with a failure mode where a bad
lookup makes both conditions false and **nothing writes, silently**.

> **Make writes dumb and reads smart.** A write that must locate an existing row can fail invisibly
> — the action reports success and changes nothing. A read that computes the wrong answer is visible
> the moment you look at it. Push the complexity to the side that shows its work.

```
write:   On change → Insert row        unconditional; no lookup, nothing to resolve
read:    Current X = latest row per key
```

You still get one-row-per-key semantics. It is derived rather than maintained.

### A state table answers one question; a log answers the ones you think of later

The session table in this repo is append-only, and that single choice yields three products:

| | Derived from |
|---|---|
| **Current state** — who am I acting as, which page | latest row per session key |
| **Impersonation ledger** — who acted as whom, when | the table, filtered |
| **Breadcrumb** — the path through the app, in order | the table, ordered |

The third is the one that settles the argument: **a breadcrumb cannot be derived from a state
table.** One row per session tells you where someone *is*; only the log tells you how they got
there. That underwrites a back affordance, "resume where you left off", usage analytics, and
support forensics — *what did they do in the ninety seconds before the error*.

It also keeps paying as the app grows. Every new page that writes a breadcrumb row is automatically
in the audit trail and the analytics, with no additional work — the same *governance by
construction* property the permission model has. Instrumentation stops being a separate concern you
remember to add, because it is the same write.

**In Flask terms:** this is the difference between `session['acting_as'] = x` and appending to an
events table. The first is one line and answers one question. The second is one line and answers
every question you have not thought of yet.

## Modelling habits that port badly

Four places where a Django/Flask instinct produces a subtly wrong Sigma build. All four cost time in
this lab.

### Identity and authority are different models — keep them apart

In Django you have `User` and you have permissions, and `user.has_perm()` quietly bridges them. It's
easy to carry over the assumption that "the user table" is one thing.

It isn't, and the grains differ:

| Question | Model | Rows here |
|---|---|---|
| *Who is this person?* | user directory — name, email, title, department | **501** |
| *What may they do?* | resolution — assignments ⋈ permissions ⋈ resources | **5 users' worth** |

```sql
-- identity
SELECT u.user_id, u.user_name, jt.job_title_name, d.department_name
FROM users u
JOIN job_titles  jt ON jt.job_title_id  = u.job_title_id
JOIN departments d  ON d.department_id  = jt.department_id;   -- note: joins to job_titles

-- authority  (the resolution query, earlier in this document)
```

Fold identity attributes into the authority model and you get a wider join that still has no rows
for everyone without a grant. Join them where a surface needs both.

**Note the department join hangs off `job_titles`, not `users`.** Department is derived through job
title — the schema's one two-hop dimension.

### The chooser must sit outside the filter it drives

Obvious in a web app and easy to get wrong here. You would never build a login page whose user list
is filtered by the currently-logged-in user — but in Sigma the identity control filters an element,
and if the roster descends from that element it inherits the filter and shows one row: the person
already selected.

```
❌  Login Roster  ← Resolution (filtered by the identity control)
✅  Login Roster  ← Assignments (not targeted by the control)
```

Same rule for the control's **value source**: pointing it at the element it filters is circular.
Sigma tolerates it, but say what you mean.

> In Flask terms: `SELECT * FROM users WHERE id = :current_user` is not a login page.

### Guarded routes and public routes are two different branches

A Flask app has `@requires_permission` routes and open routes, and they coexist in one router. Here
they cannot come from one query.

```
granted resources    reached THROUGH the permission model
universal resources  reached AROUND it
```

A resource that everyone gets has **no permission row** — that is what "universal" means — so it can
never appear in anything derived from the resolution join. Build the two branches separately and
union them, deduping on the resource key. If universal resources could be reached through the join
they would need permission rows, and then they would not be universal.

The union's dedupe matters: a resource can arrive by both paths. In this model `home` is universal
*and* granted to the anonymous role, so it appears twice and must collapse to one.

### `GROUP BY` has a Sigma equivalent, and it fails differently

In SQL, selecting a non-aggregated column that isn't in the `GROUP BY` is an error — Postgres
refuses, and you fix it immediately.

In Sigma, extra columns on a grouped element are **silently added to the display grain**, so the
group expands into its underlying rows instead of collapsing. Same rule, no error, and it looks like
the grouping "didn't work".

> **Hide the detail columns rather than deleting them.** Hidden keeps them available to calculations
> while removing them from the grain — the equivalent of using a column in `HAVING` without
> selecting it.

Related: filtering on a column you are not displaying is trivial in SQL — `WHERE` doesn't care what
you `SELECT`. In Sigma a column outside the grain looks unfilterable; it is reachable through
**Available fields**, and the filter applies before the grouping collapses rows.

### And one operational difference: elements are references, not text

Deleting a Django model class breaks imports loudly at startup. Deleting a Sigma element breaks its
children, any control using it as a value source, and any action targeting it — **silently, and only
when someone looks**.

> **Extend elements; don't delete and recreate.** Joining into an existing element preserves its
> internal ID and every reference to it. Recreating mints a new ID and orphans them all.

## Behaviours with no Flask analogue

Things that follow from the runtime being a BI tool rather than a web framework.

- **The editor shows the author's session.** It carries your data and your control values, which is
  what you want while building. What a viewer sees is a separate question — verify in an anonymous
  session against the published workbook.
- **Sigma's internal Row ID is metadata, not data.** It does not reliably survive into an anonymous
  published session — a table can come back with one fewer column than you built. Never join or
  filter on it. Mint your own GUIDs; that's why this model has them everywhere.
- **An empty control is not false, it's null.** `[User Id] = null` evaluates to null, so every
  downstream element returns zero rows with no error and nothing to diagnose. This is the argument
  for the anonymous principal: with a sentinel default the control is never empty.
- **A four-way inner join returns `0 rows` identically no matter which source went empty.** No
  error, no partial result. Make resolution joins LEFT and a failure shows up as rows with nulls in
  one column, which names the culprit on sight.
- **Types and formats do not cascade.** They're per-element. Fixing a boolean or a number format on
  a parent does not flow to its children or to charts.

## Status

Verified anonymously against a published workbook on 2026-07-24: CSV uploads render; standalone
input tables render (500 rows / 7 columns). Still open: whether `Lookup()` columns resolve for
anonymous viewers. If they don't, every label in the resolution layer must come from a join, and
that becomes the headline warning of this document.
