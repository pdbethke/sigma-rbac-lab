/**
 * Smoke check: runs each page query against the seeded database and asserts the
 * shape and a few known values, then prints SQLite's query plan for the three
 * hot InventoryDaily access paths to confirm they use indexes rather than scans.
 */

import assert from 'node:assert/strict';
import {
  prisma,
  getStoreCurrentInventory,
  getRegionLowStock,
  getProductAdjustmentHistory,
  getRegionalInventorySummary,
} from './queries.js';

async function plan(label: string, sql: string, params: unknown[] = []) {
  const rows = await prisma.$queryRawUnsafe<{ detail: string }[]>(
    `EXPLAIN QUERY PLAN ${sql}`,
    ...params
  );
  const detail = rows.map((r) => r.detail).join(' | ');
  const usesIndex = /USING (COVERING )?INDEX/.test(detail);
  console.log(`  [${usesIndex ? 'INDEX' : 'SCAN '}] ${label}: ${detail}`);
  return usesIndex;
}

async function main() {
  const store = await prisma.store.findFirstOrThrow({ where: { region: 'Northeast' } });
  const product = await prisma.product.findFirstOrThrow();

  console.log('\n1. Store current inventory');
  const inv = await getStoreCurrentInventory(store.id);
  assert.ok(inv.snapshotDate, 'expected a latest snapshot date');
  assert.equal(inv.rows.length, 6, 'expected 6 products at the store');
  assert.ok(inv.rows[0].brandName.length > 0);
  assert.ok(inv.rows[0].productFamilyName.length > 0);
  console.log('  latest:', inv.snapshotDate?.toISOString().slice(0, 10));
  console.table(inv.rows.slice(0, 3));

  console.log('\n2. Region low stock');
  const low = await getRegionLowStock('Northeast');
  assert.ok(low.rows.length > 0, 'expected low-stock rows in Northeast');
  assert.ok(low.rows.every((r) => r.storeName.length > 0));
  // Seed makes products 0 and 1 (5 and 25 units) fall under the reorder point of 30.
  assert.equal(low.rows.length, 4, 'expected 2 low products x 2 Northeast stores');
  console.table(low.rows);

  console.log('\n3. Adjustment history');
  const hist = await getProductAdjustmentHistory(store.id, product.id);
  assert.equal(hist.length, 6, 'expected 6 adjustments');
  assert.ok(hist.every((h) => h.adjustedByName.length > 0), 'every row names an adjuster');
  for (let i = 1; i < hist.length; i++) {
    assert.ok(hist[i - 1].adjustedAt >= hist[i].adjustedAt, 'newest first');
  }
  console.table(hist.slice(0, 3));

  console.log('\n4. Regional summary');
  const summary = await getRegionalInventorySummary('Northeast', inv.snapshotDate!);
  assert.equal(summary.length, 2, 'expected both Northeast stores');
  assert.ok(summary[0].totalInventoryValue > 0);
  assert.ok(
    summary[0].totalInventoryValue >= summary[1].totalInventoryValue,
    'sorted descending'
  );
  console.table(summary);

  console.log('\nQuery plans (InventoryDaily hot paths):');
  const results = await Promise.all([
    plan(
      'q1 latest date for store',
      'SELECT snapshotDate FROM InventoryDaily WHERE storeId = ? ORDER BY snapshotDate DESC LIMIT 1',
      [store.id]
    ),
    plan(
      'q1 rows for store+date',
      'SELECT unitsOnHand FROM InventoryDaily WHERE storeId = ? AND snapshotDate = ?',
      [store.id, inv.snapshotDate]
    ),
    plan(
      'q2 low stock for date+stores',
      'SELECT unitsOnHand FROM InventoryDaily WHERE snapshotDate = ? AND isLowStock = 1 AND storeId IN (?, ?)',
      [inv.snapshotDate, store.id, store.id + 1]
    ),
    plan(
      'q4 sum value by store for date',
      'SELECT storeId, SUM(inventoryValue) FROM InventoryDaily WHERE snapshotDate = ? AND storeId IN (?, ?) GROUP BY storeId',
      [inv.snapshotDate, store.id, store.id + 1]
    ),
    plan(
      'q3 adjustment history',
      'SELECT adjustedAt FROM InventoryAdjustment WHERE storeId = ? AND productId = ? ORDER BY adjustedAt DESC',
      [store.id, product.id]
    ),
  ]);

  assert.ok(
    results.every(Boolean),
    'every hot path must use an index, not a table scan'
  );

  console.log('\nAll checks passed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
