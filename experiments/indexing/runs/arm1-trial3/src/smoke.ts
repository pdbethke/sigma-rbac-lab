import { prisma } from "./client.js";
import {
  getStoreCurrentInventory,
  getLowStockByRegion,
  getProductAdjustmentHistory,
  getRegionalInventoryValue,
} from "./queries.js";

async function main() {
  console.log("1. Store current inventory (CVL-01):");
  console.table(await getStoreCurrentInventory("CVL-01"));

  console.log("\n2. Low stock across Mid-Atlantic:");
  console.table(await getLowStockByRegion("Mid-Atlantic"));

  console.log("\n3. Adjustment history for SKU-1001 at CVL-01:");
  console.table(await getProductAdjustmentHistory("CVL-01", "SKU-1001"));

  console.log("\n4. Mid-Atlantic inventory value on 2026-08-01:");
  console.table(
    await getRegionalInventoryValue(
      "Mid-Atlantic",
      new Date("2026-08-01T00:00:00.000Z"),
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
