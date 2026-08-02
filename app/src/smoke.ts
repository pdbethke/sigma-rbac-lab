import { prisma } from "./client.js";
import {
  getStoreCurrentInventory,
  getLowStockByRegion,
  getProductAdjustmentHistory,
  getRegionalSummary,
} from "./queries.js";

async function main() {
  console.log("1. Northgate current inventory:");
  console.table(await getStoreCurrentInventory("N-001"));

  console.log("\n2. Low stock in North:");
  console.table(await getLowStockByRegion("North"));

  console.log("\n3. SKU-1001 adjustments at N-001:");
  console.table(await getProductAdjustmentHistory("N-001", "SKU-1001"));

  console.log("\n4. North regional summary for 2026-08-02:");
  console.table(
    await getRegionalSummary("North", new Date("2026-08-02T00:00:00.000Z")),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
