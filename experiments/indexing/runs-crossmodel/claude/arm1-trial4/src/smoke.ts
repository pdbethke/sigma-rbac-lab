import { PrismaClient } from "@prisma/client";
import {
  getStoreCurrentInventory,
  getRegionLowStock,
  getProductAdjustmentHistory,
  getRegionalSummary,
} from "./queries";

const prisma = new PrismaClient();

async function main() {
  const eastMain = await prisma.store.findUniqueOrThrow({ where: { storeKey: "E-001" } });
  const colaClassic = await prisma.product.findUniqueOrThrow({ where: { skuNumber: "SKU-0001" } });
  const day2 = new Date("2026-08-02T00:00:00.000Z");

  console.log("1) East Main current inventory:");
  console.log(await getStoreCurrentInventory(prisma, eastMain.id));

  console.log("\n2) East region low stock:");
  console.log(await getRegionLowStock(prisma, "East"));

  console.log("\n3) Cola Classic adjustment history at East Main:");
  console.log(await getProductAdjustmentHistory(prisma, eastMain.id, colaClassic.id));

  console.log("\n4) East regional summary for 2026-08-02:");
  console.log(await getRegionalSummary(prisma, "East", day2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
