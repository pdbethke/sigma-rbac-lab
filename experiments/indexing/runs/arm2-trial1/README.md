# Retail inventory (Prisma + SQLite + TypeScript)

Data model and page queries for chain-wide retail inventory: several years of daily
snapshots across hundreds of stores.

```
npm install
npm run migrate     # create prisma/migrations + dev.db
npm run seed        # small deterministic dataset
npm run smoke       # runs all four page queries once
npm run typecheck
```

- `prisma/schema.prisma` — the model, with indexes chosen for the four pages below.
- `src/queries.ts` — one exported function per page.
- `src/client.ts` — the shared `PrismaClient` (better-sqlite3 driver adapter).

## The pages

| # | Function | Access path |
|---|---|---|
| 1 | `getStoreCurrentInventory(storeId, page?)` | `InventoryDaily(storeId, snapshotDate, productId)` |
| 2 | `getRegionLowStock(region, options?)` | `Store(region)` → `InventoryDaily(storeId, snapshotDate, isLowStock)` |
| 3 | `getProductAdjustmentHistory(storeId, productId, page?)` | `InventoryAdjustment(storeId, productId, adjustedAt)` |
| 4 | `getRegionalInventoryValue(region, snapshotDate)` | `Store(region)` → `GROUP BY storeId` over `InventoryDaily(snapshotDate, storeId)` |

## Notes on scale

`InventoryDaily` grows as days × stores × products and dwarfs every other table, so it
gets the deliberate treatment:

- **Composite indexes, ordered for the query, not for the column list.** Equality columns
  lead; the sort/range column trails. `(storeId, productId, adjustedAt)` on adjustments
  serves the filter *and* the `ORDER BY adjustedAt DESC` from one index range.
- **Every query pins a snapshot date.** Without it a "current inventory" page reads years
  of history for the store. `latestSnapshotDate()` resolves the date off the tail of an
  index rather than by scanning.
- **Regions are resolved to store ids first**, so the fact-table read is an indexed
  `IN (...)` rather than a join-then-filter across the whole table.
- **Aggregation happens in the database.** Query 4 returns one row per store, not one row
  per product per store.
- **Foreign keys are indexed explicitly** — SQLite does not do this for you.
- **The two unbounded list pages are paginated** (`take` + `cursorId`), defaulting to 200.

Verified with `EXPLAIN QUERY PLAN`: each of the four pages resolves via `SEARCH ... USING
INDEX`, with no temp B-tree for ordering.

Money columns are `Decimal`. On SQLite that is stored as `DECIMAL`; on a production
Postgres target it maps to `NUMERIC` — either way, don't switch it to `Float`.
