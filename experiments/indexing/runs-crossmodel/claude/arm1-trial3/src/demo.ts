import { PrismaClient } from "@prisma/client";
import {
  getStoreCurrentInventory,
  getRegionLowStock,
  getProductAdjustmentHistory,
  getRegionInventorySummary,
} from "./queries";

const prisma = new PrismaClient();

/** Runs each page's query against the seeded data and prints the results. */
async function main() {
  const seattle = await prisma.store.findUniqueOrThrow({ where: { storeKey: "SEA-01" } });
  const earbuds = await prisma.product.findUniqueOrThrow({ where: { sku: "SKU-1002" } });

  console.log("Page 1 — Seattle current inventory:");
  console.table(await getStoreCurrentInventory(prisma, seattle.id));

  console.log("\nPage 2 — Low stock across West region:");
  console.table(await getRegionLowStock(prisma, "West"));

  console.log("\nPage 3 — Earbuds adjustment history at Seattle:");
  console.table(await getProductAdjustmentHistory(prisma, seattle.id, earbuds.id));

  console.log("\nPage 4 — West regional summary for 2026-08-01:");
  console.table(
    await getRegionInventorySummary(prisma, "West", new Date("2026-08-01T00:00:00.000Z"))
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
