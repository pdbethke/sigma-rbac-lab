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

**Prisma version originally measured: 6.19.3.** The behavior recorded below was
specific to this version — until it was discovered that Task 4's ten trials did not
all install 6.19.3. Each trial ran its own `npm install`, and 8 of the 10 resolved to
whatever "latest" was at that moment:

| trials | Prisma version installed |
| --- | --- |
| arm1-trial1 .. arm1-trial5, arm2-trial1 .. arm2-trial3 | `^7.9.1` (8 trials) |
| arm2-trial4 | `^6.1.0` |
| arm2-trial5 | `^6.19.3` |

So the original control run covered only `arm2-trial5` directly. This section was
re-run against **7.9.1** and **6.1.0** as well, so every trial now has a control run
of its own major version to be checked against.

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

## Commands, per Prisma major version

**6.19.3** (original run, covers `arm2-trial5`):

```
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel experiments/indexing/control/schema.prisma \
  --script > experiments/indexing/control/control.sql
```

Exit code: `0`. No stderr output. Output committed at
`experiments/indexing/control/control.sql`.

**6.1.0** (covers `arm2-trial4`) — same command, same unmodified
`schema.prisma` (6.x still accepts an inline `datasource.url`):

```
cd /tmp/control61test   # scratch dir with prisma@6.1.0 installed
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel schema.prisma \
  --script > control-prisma6.1.sql
```

Exit code: `0`. Only a stderr notice that a newer Prisma exists (harmless). Output
committed at `experiments/indexing/control/control-prisma6.1.sql`.

**7.9.1** (covers the 8 remaining trials) — `migrate diff` renamed
`--to-schema-datamodel` to `--to-schema` in Prisma 7, and Prisma 7 also refuses to
validate a schema with `datasource.url` written inline (`P1012`: "The datasource
property `url` is no longer supported in schema files"). Running the literal,
unmodified `schema.prisma` therefore does not get as far as producing a diff — it
fails schema validation before `migrate diff` can run at all. To exercise Prisma 7's
own default-index behavior on the *same table/column/relation modeling*, a
byte-for-byte copy of `schema.prisma` with only the `url = "file:./control.db"` line
removed (`experiments/indexing/control/schema-prisma7-compat.prisma`) is paired with a
`prisma.config.ts` (`experiments/indexing/control/prisma7-compat.config.ts`) supplying
that same URL externally — the same restructuring every Prisma-7 trial did on its own
schema, for the same reason. No table, column, relation, `@id`, or `@@id` changed:

```
cd /tmp/control7test   # scratch dir: schema-prisma7-compat.prisma + prisma7-compat.config.ts, prisma@7.9.1 installed
npx prisma migrate diff \
  --from-empty \
  --to-schema schema.prisma \
  --script > control-prisma7.sql
```

Exit code: `0`. No stderr output. Output committed at
`experiments/indexing/control/control-prisma7.sql`.

## Result

```
$ grep -c 'CREATE INDEX' experiments/indexing/control/control.sql || echo 0
0
$ grep -c 'CREATE INDEX' experiments/indexing/control/control-prisma6.1.sql || echo 0
0
$ grep -c 'CREATE INDEX' experiments/indexing/control/control-prisma7.sql || echo 0
0
```

`experiments/indexing/parseIndexes.ts`, run against each generated SQL file, agrees
for all three:

```
parseIndexes(control.sql)             => [] (count 0)   -- Prisma 6.19.3
parseIndexes(control-prisma6.1.sql)   => [] (count 0)   -- Prisma 6.1.0
parseIndexes(control-prisma7.sql)     => [] (count 0)   -- Prisma 7.9.1
```

**Zero `CREATE INDEX` statements were emitted by every Prisma major version a trial
used.** Prisma's `migrate diff` against SQLite, for a schema with foreign-key
relations but no `@@index` and no `@unique` beyond primary keys, produces only
`CREATE TABLE` statements with inline `PRIMARY KEY` and `FOREIGN KEY ... REFERENCES`
constraints, in 6.1.0, 6.19.3, and 7.9.1 alike. None of the three adds a secondary
index on the foreign-key columns themselves (e.g. `ProductFamily.productTypeId`,
`Product.productLineId`, `Product.brandId`, `InventoryDaily.storeId`,
`InventoryDaily.productId`, `InventoryAdjustment.storeId`,
`InventoryAdjustment.productId`) even though those are exactly the columns a
hand-tuned schema would index for join performance.

Note for completeness: this is Prisma's SQLite behavior specifically. Prisma
does auto-create indexes on foreign-key columns for some other connectors
(e.g. MySQL, because MySQL's own foreign-key implementation requires an
index on the referencing column) — that is a documented connector-level
difference, not something exercised by this experiment's `sqlite` datasource.
It is mentioned here only so the article does not overgeneralize the
zero-index finding to "Prisma never emits indexes" — the finding is scoped to
this datasource.

## Consequence for grading (Task 4)

Because the count is **zero for every Prisma major version a trial actually
installed** (6.1.0, 6.19.3, 7.9.1): every `CREATE INDEX` / `@@index` a trial schema
contains is attributable to the session that wrote it, not to Prisma's default
behavior, regardless of which of the two majors it happened to resolve. Task 4's
grading is unmodified — no subtraction is needed, and this now holds for all 10
trials, not just the one (`arm2-trial5`) the original 6.19.3-only control covered.

(The rule that would have applied otherwise, stated only for completeness
since it did not fire in any version: if a count had been non-zero, those indexes
would need to be subtracted from that trial's total before crediting the agent, and
the article would need to say so explicitly rather than silently reporting
inflated numbers.)
