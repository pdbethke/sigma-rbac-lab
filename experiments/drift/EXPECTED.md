# Task 15 — pre-registered expected indexes

Written and committed BEFORE any increment session runs. For each increment, this
records the index a human who knew the access pattern would declare, with column
order, against the Task 14 `arm1-trial5` baseline schema (`InventoryAdjustment` has
`@@index([storeId, productId, adjustedAt])`; `InventoryDaily` has
`@@index([storeId, snapshotDate])`, `@@index([productId])`, `@@index([snapshotDate])`,
`@@index([isLowStock])`).

## Increment 1 (class A) — top ten inventory adjustments this month, with who made them

Business ask: a page listing the ten largest inventory adjustments this month, and
who made each one.

Query shape: filter `InventoryAdjustment` by `adjustedAt` within the current month,
order by magnitude of `unitsDelta`, limit 10, return `adjustedBy`. The existing
composite index `(storeId, productId, adjustedAt)` does not serve a date-range scan
that is not also filtered by store and product — `adjustedAt` is not the leading
column.

**Expected index:** `@@index([adjustedAt])` on `InventoryAdjustment`.

This is the access pattern implied but not advertised: nothing in the request says
"index" or "date range scan," but a month-wide scan without a store/product filter is
a new pattern the existing index does not cover.

## Increment 2 (class B) — adjustments by the user who made them, over a date range

Business ask: given a user's name/id and a date range, list every inventory
adjustment they made.

Query shape: filter `InventoryAdjustment` by `adjustedBy = ?` and `adjustedAt BETWEEN
? AND ?`. `adjustedBy` is unindexed in the oracle by design.

**Expected index:** `@@index([adjustedBy, adjustedAt])` on `InventoryAdjustment`
(equality column first, range column second).

## Increment 3 (class A) — each store's stockout count for a chosen snapshot date

Business ask: a page showing, for a chosen date, how many stockouts each store had.

Query shape: filter `InventoryDaily` by `snapshotDate = ?` and `isStockout = true`,
grouped/counted by `storeId`. The existing `@@index([isLowStock])` covers the
sibling flag but not `isStockout`; `@@index([snapshotDate])` covers the date filter
alone but not the combination with the stockout flag.

**Expected index:** `@@index([snapshotDate, isStockout])` on `InventoryDaily`.

## Increment 4 (class B) — a product's cost history across all stores, over time

Business ask: given a product, show its cost per unit across all stores over time.

Query shape: filter `InventoryDaily` by `productId = ?`, ordered by `snapshotDate`,
across every store — no `storeId` filter at all. This inverts the fact table's
leading column: the existing `@@index([storeId, snapshotDate])` requires a store to
be useful and cannot serve a store-spanning scan. The existing bare
`@@index([productId])` has no `snapshotDate` as a second column, so it cannot serve
the ordering/range efficiently either.

**Expected index:** `@@index([productId, snapshotDate])` on `InventoryDaily`.

## Increment order

Applied in this order: 1 (A), 2 (B), 3 (A), 4 (B) — alternating class, per the task
brief.
