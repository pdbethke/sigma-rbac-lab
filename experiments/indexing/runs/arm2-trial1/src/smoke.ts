/** Runs each page query once against the seeded database. */
import { prisma } from "./client.js";
import {
  getProductAdjustmentHistory,
  getRegionLowStock,
  getRegionalInventoryValue,
  getStoreCurrentInventory,
  latestSnapshotDate,
} from "./queries.js";

async function main() {
  const store = await prisma.store.findFirstOrThrow({ orderBy: { id: "asc" } });
  const product = await prisma.product.findFirstOrThrow({
    orderBy: { id: "asc" },
  });

  const current = await getStoreCurrentInventory(store.id, { take: 3 });
  console.log("1. current inventory", current.snapshotDate, current.rows);

  const low = await getRegionLowStock(store.region, { take: 3 });
  console.log("2. low stock in", low.region, low.snapshotDate, low.rows);

  const history = await getProductAdjustmentHistory(store.id, product.id, {
    take: 3,
  });
  console.log("3. adjustment history", history);

  const date = await latestSnapshotDate();
  const summary = await getRegionalInventoryValue(store.region, date!);
  console.log(
    "4. regional value",
    summary.map((s) => [s.storeName, s.totalInventoryValue.toString(), s.productCount]),
  );
}

main().finally(() => prisma.$disconnect());
