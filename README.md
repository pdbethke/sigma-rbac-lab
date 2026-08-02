# Sigma RBAC Lab

A working reference for building **multi-user, role-based access control into a Sigma workbook** —
constructed one layer at a time, with every layer verified against the published app as an
anonymous viewer sees it.

## Why I built this

I'm a software architect and Python developer. I've spent thirty years building multi-user systems,
which means I've built role-based access control more times than I can count — in Flask, in Django,
and in a good many things that predate both.

So when I pick up a new framework or platform, my first question is always the same:

> **Can it build an RBAC?**

It's a good litmus test, because RBAC exercises everything at once. You need a data model that
expresses many-to-many honestly. You need joins that behave predictably when a foreign key is null.
You need somewhere to hold identity, and a way to resolve it into effective permissions. You need
writes, and a story about who may make them. You need the UI to reflect authority without *being*
the authority. A system that can carry all of that cleanly can carry most things. A system that
can't will fight you forever.

### The distinction that matters

Nearly every BI platform ships row-level security. You configure it against **their** user
directory, with **their** attribute model, and it does what they designed it to do. That is a
feature you switch on.

This is a different thing: **an authorization model the platform knows nothing about.** Seventeen
tables of imported CSV — my roles, my scopes, my grant semantics, revocation as a status rather than
a deletion, an append-only ledger. Sigma renders it and enforces exactly one boundary of its own
(*may you write at all*). It has no idea what "supervisor at Site 305" means, because that concept
is mine.

The proof that it's genuinely independent is in this repo: **the same tables run in SQLite.**
The `oracle/` directory isn't only a testing convenience — it's evidence the model isn't
Sigma-shaped. Sigma is a rendering target, not the owner.

| Platform RLS | An application-level model |
|---|---|
| bound to their user directory | any subject you can put in a table |
| their attribute semantics | scoped grants, delegation, expiry — whatever you model |
| removing a grant deletes a row | revocation is a status change; the log outlives it |
| configuration | data — versioned, diffable, testable |
| portable nowhere | runs unchanged in SQLite, Postgres, or behind Flask |

So the question this repo actually answers isn't *"does this platform have access control?"* — most
do, to some degree. It's:

> **Can I build my own authorization model on it, from my own data, and have the interface obey it?**

This repo is that question, asked of Sigma, and answered by building it — one element at a time,
publishing after each step and reading the result as an anonymous visitor sees it, with a SQL oracle
computing the expected answer independently so every step had a known-correct result to check
against.

**Sigma passed, and the exercise left me genuinely confident in the platform.** A complete
authorization layer — scoped grants, live revocation, a grounded agent, a named anonymous principal
— runs correctly on Sigma Public and serves properly to unauthenticated visitors. Every construct I
tested behaved as designed.

The differences from a web framework turned out to be considered rather than incidental. The join
editor reports unmatched and multi-match keys *before* you commit a join, which catches a class of
modelling error that a SQL `JOIN` will happily accept in silence. Draft and published data are held
separately, which prevents a naive publish from overwriting what live users wrote while you were
building. The one genuine architectural difference — that there is no route guard, so authorization
has to be enforced by scoping data rather than hiding pages — is the same discipline as row-level
security, and arguably the more honest of the two.

The rest of this repo is what I learned, written down for the next person arriving from the same
direction. [`docs/TRANSLATION.md`](docs/TRANSLATION.md) is the document I most wanted to exist when
I started: the same authorization model in SQL and in Sigma, side by side.

## What this demonstrates

A complete authorization model runs on Sigma Public and serves correctly to unauthenticated
visitors:

- **Seventeen GUID-keyed tables** — nine for authority (subjects, roles, permissions, resources,
  scopes and the junctions), eight for the multi-tenant dataset they gate
- **A four-source LEFT join chain** resolving effective permissions per user, per scope
- **Scoped grants** — one user holding two roles at two different scopes, resolved correctly
- **A tenant boundary** — 94,500 inventory rows across three stores, where a store manager sees
  31,500 and a regional manager sees all of them, from the same element
- **Read and write authority as separate questions** — one user reads every row of her store and
  can post nothing, differing from her manager only in `can_edit`
- **Gated options, not validated submissions** — the store dropdown offers what you may write to,
  so an illegal choice is never representable
- **Rules as data** — serial-number formats declared per brand and overridden per product line,
  resolved most-specific-first. Adding a rule is a row, not a deploy
- **An agent scoped by absence, not refusal** — grounded only on gated elements, so it cannot
  describe a store the acting user can't see. Nothing was declined; the rows were never there
- **Live administration** — an authenticated user revokes a grant and every reader, including
  anonymous ones, sees it stop granting
- **A named anonymous principal**, so "logged out" is an identity rather than a special case

All of it verified against a SQL oracle with zero drift.

## What's here

```
data/             seventeen GUID-keyed seed tables (CSV), plus the runtime session store
oracle/           SQLite schema, the resolution query, and a build script
expected/         frozen fixtures the Sigma build is diffed against
docs/             field guide, build log, Flask↔Sigma translation, evidence
skills/           the platform mechanics learned here, as an agent-readable skill
app/              a generated Prisma application, committed as-generated, used as the N+1 scanner's corpus
datapackage.json  the same schema as machine-readable JSON (Frictionless Table Schema)
```

### The model

```
departments ──┐
              ├── job_titles ── users ── platform_roles
              ┘                   │
                                  ├── assignments ── roles ── permissions ── resources
                                  │        │
                                  │        └── scopes
                                  └── (department derived via job title)
```

Plus the dataset the model gates — a conventional star, joined to authority through `scopes`:

```
stores ──┐                    scopes.scope_key = stores.store_id
         ├── inventory_daily ── products ── brands
         │                          └── product_lines ── product_families ── product_types
         └── inventory_adjustments   (append-only; corrections are new facts, never edits)
```

GUID keys throughout, no orphans. Abstract vocabulary (`resources`, `scopes`) with concrete sample
values (pages, stores), so the pattern ports to any domain.

**Three-part identity on every entity:** a **GUID** to join on, a **Key** slug for formulas to
reference as a literal, and a **Name** for display. Names collide — the fixture ships with a live
collision to prove it.

### Fixture cases, chosen deliberately

| Case | Exercises |
|---|---|
| One user holds two roles at two different scopes | scope-correct resolution |
| Two users hold the same role at different scopes | the scope boundary |
| Three assignments have a blank scope (global) | nullable foreign keys through a join |
| One user is both grantor and grantee | self-referential FK |
| 5 granted users out of 500 | the roster resolves from grants, not from the directory |
| One job title spans two departments | why identity keys on GUIDs, not labels |
| `Public User` at the nil UUID | the anonymous principal |
| Two product lines both named `Gaming Laptops`, under different families | why the hierarchy keys on GUIDs — on labels they merge |
| `ALL SCOPES` and `NO SCOPES` as sentinel rows | intent stated, never inferred from a null |
| A store manager with global audit access | authority does not transfer between resources |

### The anonymous principal

`00000000-0000-0000-0000-000000000000` — a real user row holding a real `public` role, granted
view-only access to the universal resources.

This keeps "not signed in" from being a special case. An identity control with no value produces
null comparisons, and `[User Id] = null` evaluates to null rather than false — so a sentinel
principal means the control always resolves and the model needs no null-handling anywhere. Every
mature auth system names its anonymous subject: Windows has `ANONYMOUS LOGON`, Unix has `nobody`,
OIDC has the unauthenticated principal.

## Method

Each step builds **one** thing, publishes, then opens the public URL in an anonymous browser session
and records **row and column counts** against the oracle's expected output.

The editor shows the author's own session — its data and its control values. What a viewer sees is a
separate question, and the only way to answer it is to look. Three sessions cover it: anonymous,
authenticated non-owner, owner.

## Where to start

| If you want | Read |
|---|---|
| **to pick this up and continue** | [`docs/HANDOFF.md`](docs/HANDOFF.md) — state, what's left, what will bite |
| to solve a specific problem | [`docs/FIELD_GUIDE.md`](docs/FIELD_GUIDE.md) — indexed by symptom |
| the model, as SQL and as Sigma | [`docs/TRANSLATION.md`](docs/TRANSLATION.md) |
| what was built, in order, with results | [`docs/BUILD_LOG.md`](docs/BUILD_LOG.md) |
| to run the oracle yourself | `python3 oracle/build.py` |
| to regenerate the dataset from a flat export | `python3 oracle/normalize.py` — deterministic, additive, `--check` diffs without writing |

## Verified behaviour

Everything below was read from a published workbook in a browser session with **no Sigma login**:

**The platform**

| | |
|---|---|
| CSV input tables | render completely |
| Four chained LEFT joins over five sources | render completely |
| Filters, calculated columns, grouping, aggregation | evaluate correctly |
| Controls | render, and filter correctly |
| Control state | per-session — two visitors can act as different identities simultaneously |
| Agent / chat elements | render, and read **published** data |
| Input-table writes by an authenticated user | reach other sessions live |
| Writes by anonymous visitors | not possible — writing requires an account |

**The application**

| Element | Anonymous result |
|---|---|
| `Resolution` — effective permissions for the acting identity | **1 row** for the anonymous principal |
| `Login Roster` — who you may act as | **5**, independent of who is selected |
| `User Directory` — identity, separate from authority | 501 |
| `Nav Source` — universal ∪ granted, deduped | **2** anonymous · 3 · 4 · 5 · **6** across the five identities |
| `My Inventory` — the tenant boundary | **0** anonymous · 31,500 one store · 94,500 global |
| `Write Gate` — may this identity post at all | **0** anonymous · 0 view-only · **1** for a manager |
| `Inventory Postable Scopes` — what the store dropdown may offer | **0** anonymous · **1** store for a manager |
| `Audit Gate` / `Audit Trail` | **0** for everyone but the auditor |
| `Sessions` — append-only session log | accumulating live |

The nav count is the one worth noting: `home` is granted to the anonymous role **and** flagged
universal, so it arrives through both branches and collapses to a single item. That case is in the
fixture deliberately.

The pair worth clicking through is **31,500 and 31,500** — two store managers, the same element,
the same row count, and entirely different rows. Count proves scoping is happening; only the store
name proves it's the *right* scoping. Several bugs in this build hid behind numbers that looked
correct.

The details — including where data lives across draft and published versions, and what
`CurrentUserEmail()` actually returns — are in the field guide.
