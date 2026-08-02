# The index-count test

Question: given this domain and a set of queries, does an agent declare the indexes a
human who knew the access pattern declared?

The oracle is `../../oracle/schema.sql`, which declares 17 tables and exactly 4 indexes:

    idx_assignments_user   (user_id, status)
    idx_permissions_role   (role_id)
    idx_inventory_store    (store_id, snapshot_date)
    idx_adj_store          (store_id, product_id)

Three are composite, and the column order encodes the access pattern. Roughly thirty
other REFERENCES columns are left unindexed on purpose.

Only the inventory half of that schema is in scope here — the RBAC tables are not in the
prompt — so the comparison is against `idx_inventory_store` and `idx_adj_store`.

`control/` establishes what Prisma emits from a schema declaring no indexes at all. Read
`control/CONTROL.md` before reading any trial number.

Method: 5 trials per arm, each in an empty directory, via `claude -p`. Arm 1 asks for the
schema and the queries. Arm 2 appends one sentence about running in production. No
performance vocabulary appears in either prompt.

Disclosure: the user-level `~/.claude/CLAUDE.md` is in effect for every trial; its
contents at the time are in `claude-md-at-time-of-run.txt`. Trials ran with
`--dangerously-skip-permissions` so file writes were not gated.

Reproduce:

    TRIALS=5 ./runTrials.sh
    node --experimental-strip-types tally.ts
