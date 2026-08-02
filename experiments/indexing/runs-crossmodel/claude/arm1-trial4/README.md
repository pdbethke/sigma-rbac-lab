# Retail Inventory (Prisma + SQLite + TypeScript)

Inventory for a chain of stores. The data model, in `prisma/schema.prisma`:

- **Store** → **InventoryDaily** / **InventoryAdjustment**
- Product hierarchy: **ProductType** → **ProductFamily** → **ProductLine** → **Product**
- **Brand** → **Product**

## Setup

```bash
npm install
npx prisma migrate dev --name init   # creates dev.db and runs the seed
```

`DATABASE_URL` lives in `.env` (defaults to `file:./dev.db`).

## Queries

`src/queries.ts` exports one function per page. Each takes a `PrismaClient`.

| # | Page | Function |
|---|------|----------|
| 1 | A store's current inventory (latest snapshot) | `getStoreCurrentInventory(prisma, storeId)` |
| 2 | Low stock across a region | `getRegionLowStock(prisma, region, snapshotDate?)` |
| 3 | A product's adjustment history at a store | `getProductAdjustmentHistory(prisma, storeId, productId)` |
| 4 | Regional summary: inventory value per store | `getRegionalSummary(prisma, region, snapshotDate)` |

Notes:
- **(1)** resolves the store's most recent `snapshotDate`, then returns that day's rows.
- **(2)** defaults to the region's latest snapshot ("currently low"); pass a date to pin it.
- **(4)** sums `inventoryValue` per store with `groupBy`, ordered by value descending.

## Smoke test

`src/smoke.ts` runs all four against the seeded data:

```bash
npx ts-node src/smoke.ts
```
