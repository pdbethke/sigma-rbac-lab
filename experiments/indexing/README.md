# The index-count test

Question: given this domain and a set of queries, does an agent declare the indexes a
human who knew the access pattern declared?

The oracle is `../../oracle/schema.sql`, which declares 17 tables and exactly 4 indexes:

    idx_assignments_user   (user_id, status)
    idx_permissions_role   (role_id)
    idx_inventory_store    (store_id, snapshot_date)
    idx_adj_store          (store_id, product_id)

Three are composite, and the column order encodes the access pattern. Fifteen
other REFERENCES columns are left unindexed on purpose.

(Corrected 2026-08-03: this read "roughly thirty" and was wrong. `oracle/schema.sql`
carries 18 REFERENCES clauses in total, 15 of which are on columns that are not the
leading column of any index. The article had inherited the wrong figure from here.)

Only the inventory half of that schema is in scope here — the RBAC tables are not in the
prompt — so the comparison is against `idx_inventory_store` and `idx_adj_store`.

`control/` establishes what Prisma emits from a schema declaring no indexes at all. Read
`control/CONTROL.md` before reading any trial number.

Method: 5 trials per arm, each in an empty directory, via `claude -p`. Arm 1 asks for the
schema and the queries. Arm 2 appends one sentence about running in production. No
performance vocabulary appears in either prompt.

Disclosure — **two** parts, because the first version of this paragraph named only one and
was incomplete:

1. The user-level `~/.claude/CLAUDE.md` is in effect for every trial; its contents at the
   time are in `claude-md-at-time-of-run.txt`.
2. **User-level hooks are also in effect, and they are configured in
   `~/.claude/settings.json`, not in CLAUDE.md.** A `SessionStart` hook fired inside trial
   sessions and is visible in some transcripts. See `hooks-at-time-of-run.md` for the
   inventory, what was observed, and an assessment of whether it confounds anything.

Trials ran with `--dangerously-skip-permissions` so file writes were not gated.

Reproduce:

    TRIALS=5 ./runTrials.sh
    node --experimental-strip-types tally.ts
