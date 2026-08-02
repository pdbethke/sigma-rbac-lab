# Control run: what does Prisma emit on its own?

## Purpose

Later tasks credit an agent with every index its Prisma schema causes to be
declared. That crediting is only valid if Prisma's SQLite migration engine
does not emit `CREATE INDEX` statements on its own for a schema that declares
relations but no `@@index` and no `@unique` beyond primary keys. This run
measures that, before any trial runs.

## Environment

```
$ npx prisma --version
prisma                  : 6.19.3
@prisma/client          : Not found
Computed binaryTarget   : debian-openssl-3.0.x
Operating System        : linux
Architecture            : x64
Node.js                 : v22.23.2
TypeScript              : 5.9.3
Query Engine (Node-API) : libquery-engine c2990dca591cba766e3b7ef5d9e8a84796e47ab7 (at node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node)
PSL                     : @prisma/prisma-schema-wasm 7.1.1-3.c2990dca591cba766e3b7ef5d9e8a84796e47ab7
Schema Engine           : schema-engine-cli c2990dca591cba766e3b7ef5d9e8a84796e47ab7 (at node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x)
Default Engines Hash    : c2990dca591cba766e3b7ef5d9e8a84796e47ab7
Studio                  : 0.511.0
```

**Prisma version measured: 6.19.3.** The behavior recorded below is specific
to this version; if a later Prisma changes its default index behavior for
relation scalars on SQLite, this control run would need to be redone.

## Schema

`experiments/indexing/control/schema.prisma` models the inventory half of
`oracle/schema.sql`: `Store`, `ProductType`, `ProductFamily`, `ProductLine`,
`Brand`, `Product`, `InventoryDaily`, `InventoryAdjustment`. All relations
(`ProductFamily -> ProductType`, `ProductLine -> ProductFamily`,
`Product -> ProductLine`, `Product -> Brand`, `InventoryDaily -> Store`,
`InventoryDaily -> Product`, `InventoryAdjustment -> Store`,
`InventoryAdjustment -> Product`) are declared via `@relation` on foreign-key
scalar fields. The schema declares **zero** `@@index` and no `@unique`
beyond the primary keys (`@id` / composite `@@id`).

## Command

```
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel experiments/indexing/control/schema.prisma \
  --script > experiments/indexing/control/control.sql
```

Exit code: `0`. No stderr output. The full generated DDL is committed at
`experiments/indexing/control/control.sql`.

## Result

```
$ grep -c 'CREATE INDEX' experiments/indexing/control/control.sql || echo 0
0

$ grep -n 'CREATE INDEX' experiments/indexing/control/control.sql
(no output, grep exit code 1 — no matches)
```

`experiments/indexing/parseIndexes.ts`, run against the generated SQL, agrees:

```
parseIndexes(sql) => []
count: 0
```

**Zero `CREATE INDEX` statements were emitted.** Prisma's `migrate diff`
against SQLite, for a schema with foreign-key relations but no `@@index`
and no `@unique` beyond primary keys, produces only `CREATE TABLE`
statements with inline `PRIMARY KEY` and `FOREIGN KEY ... REFERENCES`
constraints. It does not add a secondary index on the foreign-key columns
themselves (e.g. `ProductFamily.productTypeId`, `Product.productLineId`,
`Product.brandId`, `InventoryDaily.storeId`, `InventoryDaily.productId`,
`InventoryAdjustment.storeId`, `InventoryAdjustment.productId`) even though
those are exactly the columns a hand-tuned schema would index for join
performance.

Note for completeness: this is Prisma's SQLite behavior specifically. Prisma
does auto-create indexes on foreign-key columns for some other connectors
(e.g. MySQL, because MySQL's own foreign-key implementation requires an
index on the referencing column) — that is a documented connector-level
difference, not something exercised by this experiment's `sqlite` datasource.
It is mentioned here only so the article does not overgeneralize the
zero-index finding to "Prisma never emits indexes" — the finding is scoped to
this datasource.

## Consequence for grading (Task 4)

Because the count is **zero**: every `CREATE INDEX` / `@@index` a trial
schema contains is attributable to the session that wrote it, not to
Prisma's default behavior. Task 4's grading is unmodified — no subtraction
is needed.

(The rule that would have applied otherwise, stated only for completeness
since it did not fire: if the count had been non-zero, those indexes would
need to be subtracted from a trial's total before crediting the agent, and
the article would need to say so explicitly rather than silently reporting
inflated numbers.)
