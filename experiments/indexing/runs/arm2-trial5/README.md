# Retail inventory

TypeScript + Prisma + SQLite. `prisma/schema.prisma` holds the model,
`src/queries.ts` exports one function per page.

```bash
npm install
npx prisma migrate deploy   # or: npx prisma migrate dev
npm run typecheck
```

## Pages

| Function | Page |
| --- | --- |
| `getStoreCurrentInventory(storeId, opts?)` | A store's current inventory |
| `getRegionLowStock(region, opts?)` | Low stock across a region |
| `getProductAdjustmentHistory(storeId, productId, opts?)` | A product's adjustment history at a store |
| `getRegionalSummary(region, snapshotDate)` | Total inventory value per store |

## Scale notes

`InventoryDaily` is the only table that grows: years x daily x hundreds of
stores x thousands of SKUs. Everything else is a dimension table that stays
small. The indexes on it exist for specific pages:

- `@@unique([snapshotDate, storeId, productId])` — the natural key, and the
  access path for the regional roll-up (page 4).
- `@@index([storeId, snapshotDate])` — a store's latest snapshot (page 1).
- `@@index([storeId, snapshotDate, isLowStock])` — a store-day's low-stock rows
  (page 2).
- `@@index([productId, snapshotDate])` — a SKU's history across the chain.

Verified against SQLite's planner: all four pages resolve to index searches,
none to a table scan.

Consequences in the query code:

- Pages 1, 2 and 4 are pinned to a single snapshot date. Page 2's date is
  optional and defaults to the region's most recent snapshot — without that
  pin it would sweep years of history and return the same SKU once per day it
  happened to be low.
- Pages 1–3 are paged and return a SQL `count` alongside the rows, rather than
  fetching a slice and measuring it in JS.
- Page 4 sums with `groupBy` in SQL. A region-day is hundreds of thousands of
  rows; none of them need to cross the wire.

## Assumption worth flagging

The spec lists `InventoryAdjustment` as carrying "who adjusted it" with no
separate person model, so `adjustedBy` is a string field and page 3 returns it
directly. If adjusters are real system users you want to filter and report on,
promote this to a `User` model with a foreign key — it's a one-migration
change, and the index on `InventoryAdjustment` does not need to move.
