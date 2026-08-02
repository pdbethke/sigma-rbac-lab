---
name: performance
description: Use when writing or reviewing ORM query code, when adding a query that reads related records, or when asked to scan for N+1 queries. Reports N+1 candidates with file and line.
---

# Performance

## Scan

    npm run scan

Reports two rules:

- `query-in-loop` — a query method called once per iteration of a loop or a map callback.
- `unincluded-relation` — a relation read on a record fetched without `include` or `select`.

These are **candidates, not proofs**. Read each one and decide. A loop over three
configuration rows is fine; the same shape over 31,500 inventory rows is not.

## When writing query code

An index is a claim about how the data will be read, paid for in writes and in storage.
Before adding a query that filters or orders on a column, say which access pattern it
serves — and if no index serves it, say that too. An absent index reads identically to a
considered decision not to have one, so the decision has to be written down.

Prefer one query that fetches the set to a query per record. `include` to load a relation
with its parent; `select` when only some fields are needed.
