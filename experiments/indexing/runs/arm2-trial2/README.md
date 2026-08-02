# Retail inventory

TypeScript + Prisma 7 + SQLite. Chain-wide store inventory: daily snapshots,
adjustments, and a product hierarchy.

```bash
npm install
npx prisma migrate dev     # create prisma/dev.db from prisma/schema.prisma
npm run seed               # small deterministic fixture
npm run smoke              # exercises all four page queries + checks query plans
npm run typecheck
```

`DATABASE_URL` lives in `.env`; Prisma 7 reads it through `prisma.config.ts`,
and the client connects via the better-sqlite3 driver adapter in
`src/client.ts`.

## Layout

| Path | What |
| --- | --- |
| `prisma/schema.prisma` | Data model. Every index carries a comment naming the page it serves. |
| `src/queries.ts` | One exported function per page. |
| `src/client.ts` | PrismaClient singleton + driver adapter. |
| `src/seed.ts` | 4 stores / 16 products / 30 days of snapshots. |
| `src/smoke.ts` | Behavioral checks plus `EXPLAIN QUERY PLAN` assertions. |

## The pages

| # | Function | Returns |
| --- | --- | --- |
| 1 | `getStoreCurrentInventory(storeId, page?)` | Every product at one store on the latest snapshot date — product, brand, family, units on hand. |
| 2 | `getRegionLowStock(region, opts?)` | Low-stock rows across a region on one date — store, product, units on hand. |
| 3 | `getProductAdjustmentHistoryAtStore(storeId, productId, page?)` | Adjustment history newest first, including who made each one. |
| 4 | `getRegionalInventoryValueSummary(region, snapshotDate)` | Total inventory value per store for one date. |

## Scale notes

`InventoryDaily` is the only table that grows with time — several years of
daily snapshots across hundreds of stores puts it in the hundreds of millions
of rows. Three decisions follow from that:

**Every read is pinned to one snapshot date.** "Current inventory" resolves the
latest date first (a one-row backwards seek on an index), then reads that date.
Nothing walks the history to derive a per-row newest.

**Indexes are chosen per page, not per column.** `InventoryDaily` carries three:
the `(snapshotDate, storeId, productId)` unique that defines the grain and
serves the regional summary from its leading pair; `(storeId, snapshotDate,
isLowStock)` for the store and region pages, with the flag as the third column
so low-stock filtering happens inside the index; and `productId` purely for
foreign-key maintenance, which would otherwise scan the whole table on a
product delete. Each one is also a cost on the nightly load, so there are no
speculative extras.

**Lists are paginated and aggregates are pushed down.** No page function can
return an unbounded result set, and the regional summary is a grouped scan in
the database rather than a fetch-and-sum in JS.

`npm run smoke` asserts these hold — it prints the SQLite query plan for each
hot statement and fails if any of them falls back to a table scan or needs a
temp b-tree sort:

```
q1 latest-date : SEARCH InventoryDaily USING COVERING INDEX InventoryDaily_storeId_snapshotDate_isLowStock_idx (storeId=?)
q1 page rows   : SEARCH InventoryDaily USING INDEX InventoryDaily_snapshotDate_storeId_productId_key (snapshotDate=? AND storeId=?)
q2 low stock   : SEARCH InventoryDaily USING INDEX InventoryDaily_storeId_snapshotDate_isLowStock_idx (storeId=? AND snapshotDate=? AND isLowStock=?)
q3 history     : SEARCH InventoryAdjustment USING COVERING INDEX InventoryAdjustment_storeId_productId_adjustedAt_idx (storeId=? AND productId=?)
q4 summary     : SEARCH InventoryDaily USING INDEX InventoryDaily_snapshotDate_storeId_productId_key (snapshotDate=? AND storeId=?)
```

## Two judgment calls worth knowing

- **Page 2 takes a snapshot date, defaulting to the region's newest.** Resolving
  a latest date per store would mix a store whose nightly load has landed with
  one whose hasn't. One page, one comparable day; a store missing that day shows
  no rows.
- **Money is `Decimal`, and sums stay `Decimal`.** `totalInventoryValue` is not
  converted to a JS number anywhere in `queries.ts`. Note that SQLite has no
  native decimal type — Prisma stores these as `DECIMAL` affinity, which is real
  arithmetic under the hood. On a production engine (Postgres) the same schema
  gets true fixed-point; if this stays on SQLite, money totals should be
  spot-checked against the source system.
