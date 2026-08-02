import {
  prisma,
  getStoreCurrentInventory,
  getRegionLowStock,
  getProductAdjustmentHistory,
  getRegionalSummary,
} from "./queries";

async function main() {
  // Austin has id 1, headphones product id 1 in the seed order.
  const austin = await prisma.store.findFirstOrThrow({
    where: { storeKey: "TX-AUS-01" },
  });
  const headphones = await prisma.product.findFirstOrThrow({
    where: { sku: "ACM-HP-100" },
  });

  console.log("1) Store current inventory (Austin, latest date):");
  console.table(await getStoreCurrentInventory(austin.id));

  console.log("\n2) Low stock across region 'South':");
  console.table(await getRegionLowStock("South"));

  console.log("\n3) Adjustment history (Austin / headphones):");
  console.table(await getProductAdjustmentHistory(austin.id, headphones.id));

  console.log("\n4) Regional summary (South, 2026-08-01):");
  console.table(
    await getRegionalSummary("South", new Date("2026-08-01T00:00:00.000Z"))
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
