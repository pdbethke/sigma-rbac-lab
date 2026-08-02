# Retail inventory

TypeScript + Prisma 7 + SQLite. Retail inventory across a chain of stores.

## Setup

    npm install
    npm run migrate      # creates dev.db and applies prisma/migrations
    npm run seed         # a few stores, products and snapshots
    npm run smoke        # runs all four page queries and prints the results

`DATABASE_URL` lives in `.env` (defaults to `file:./dev.db`).

## Layout

- `prisma/schema.prisma` — the data model.
- `src/client.ts` — the `PrismaClient` singleton, wired to the better-sqlite3 driver adapter.
- `src/queries.ts` — one exported function per page.
- `src/seed.ts`, `src/smoke.ts` — sample data and a runnable check.

## The four pages

| Page | Function |
|---|---|
| A store's current inventory | `getStoreCurrentInventory(storeKey)` |
| Low stock across a region | `getLowStockByRegion(region)` |
| A product's adjustment history at a store | `getProductAdjustmentHistory(storeKey, skuNumber)` |
| Regional summary for a snapshot date | `getRegionalSummary(region, snapshotDate)` |

Pages 1 and 2 resolve "current" as the latest snapshot date rather than taking a
date argument — page 1 per store, page 2 across the region. Page 4 takes an
explicit date, as specified.

## Indexes

`InventoryDaily` and `InventoryAdjustment` are the two tables that grow per day,
so their indexes follow the access paths above rather than blanket-covering every
foreign key:

- `InventoryDaily(storeId, snapshotDate)` — pages 1 and 2 enter by store, then
  narrow by date. Store leads because it is always an equality match.
- `InventoryDaily(snapshotDate)` — page 4 sweeps one date across a region's stores.
- `InventoryDaily(snapshotDate, storeId, productId)` unique — enforces the stated
  grain of one row per date, store and product.
- `InventoryAdjustment(storeId, productId, adjustedAt)` — page 3's filter and its
  newest-first sort in one pass.
- `Store(region)` — pages 2 and 4 both scope by region first.

## Notes

Prisma 7 no longer accepts `url` in the `datasource` block; the connection string
is supplied through `prisma.config.ts` for the CLI and through the driver adapter
in `src/client.ts` at runtime.
