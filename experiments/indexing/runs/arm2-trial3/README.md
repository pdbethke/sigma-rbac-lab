# Retail inventory

TypeScript + Prisma 7 + SQLite. Inventory for a chain of stores: daily snapshots
per store and product, plus manual adjustments.

## Layout

| Path | What |
| --- | --- |
| `prisma/schema.prisma` | Data model and indexes |
| `src/queries.ts` | One exported function per page |
| `src/seed.ts` | Small deterministic seed |
| `src/verify.ts` | Smoke test + `EXPLAIN QUERY PLAN` assertions |

## Run

```bash
npm install
npm run generate
npm run migrate      # creates ./dev.db
npm run seed
npm run verify
```

`DATABASE_URL` lives in `.env` (`file:./dev.db`). Prisma 7 reads it via
`prisma.config.ts` for the CLI, and `src/queries.ts` passes it to the
better-sqlite3 driver adapter at runtime.

## The page queries

| Function | Page |
| --- | --- |
| `getStoreCurrentInventory(storeId)` | Everything held at one store on its latest snapshot date |
| `getRegionLowStock(region)` | Products flagged low stock at any store in a region |
| `getProductAdjustmentHistory(storeId, productId)` | One product's adjustment history at one store, with who made each |
| `getRegionalInventorySummary(region, snapshotDate)` | Total inventory value per store for a date |

## Notes on scale

`InventoryDaily` is the fact table — years of daily snapshots times hundreds of
stores times the catalog. The three indexes on it each exist for a named query,
with equality columns leading and the range/sort column trailing:

- `(storeId, snapshotDate)` — the latest-date probe and the store's day of rows
- `(snapshotDate, storeId)` — the regional value rollup for one date
- `(snapshotDate, isLowStock, storeId)` — the region-wide low-stock list

`npm run verify` asserts via `EXPLAIN QUERY PLAN` that all five hot access paths
resolve through an index rather than a table scan, so a schema change that
silently drops one fails the check.

Three further choices are deliberate:

- **Region filters resolve to store ids first.** `Store(region)` returns a few
  hundred rows; the fact-table read then stays an indexed `storeId IN (...)`
  lookup instead of a join the planner might drive from the wrong side.
- **The latest snapshot date is a single indexed probe**, not a `max()` or
  `groupBy` over the store's whole history.
- **List queries are paginated** (`take`/`skip`, default 100, max 1000) and the
  regional rollup aggregates in the database. For deep paging, switch the list
  endpoints to cursor pagination — `skip` degrades on large offsets.

## Deviation from the brief

`InventoryAdjustment.adjustedBy` is modeled as a relation to a `User` table
(`fullName`, `email`) rather than a bare name string, since page 3 returns who
made each adjustment. Swap it for a scalar column if adjusters aren't real
accounts in your system.
