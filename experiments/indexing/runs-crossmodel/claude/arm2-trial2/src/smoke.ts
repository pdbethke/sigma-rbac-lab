import {
  prisma,
  getStoreCurrentInventory,
  getLowStockByRegion,
  getProductAdjustmentHistory,
  getRegionalInventoryValue,
} from './queries';

// Runs each page's query against the seeded database and prints the results,
// so the queries are demonstrated rather than merely asserted.

async function main() {
  const east = await prisma.store.findUniqueOrThrow({ where: { storeKey: 'S-001' } });
  const p1 = await prisma.product.findUniqueOrThrow({ where: { sku: 'SKU-1001' } });

  console.log('\n[1] Current inventory at', east.name);
  console.table(await getStoreCurrentInventory(east.id));

  console.log('\n[2] Low stock across region "East"');
  console.table(await getLowStockByRegion('East'));

  console.log('\n[3] Adjustment history for', p1.sku, 'at', east.name);
  console.table(await getProductAdjustmentHistory(east.id, p1.id));

  console.log('\n[4] Regional inventory value, region "East", 2026-08-01');
  const rows = await getRegionalInventoryValue('East', new Date('2026-08-01T00:00:00Z'));
  console.table(
    rows.map((r) => ({ ...r, totalInventoryValue: r.totalInventoryValue.toString() })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
