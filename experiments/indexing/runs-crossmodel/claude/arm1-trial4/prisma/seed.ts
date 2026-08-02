import { PrismaClient } from "@prisma/client";

/**
 * A tiny, deterministic seed: 2 regions, 3 stores, a small product hierarchy,
 * two snapshot dates, and a couple of adjustments. Enough to exercise every
 * query in src/queries.ts.
 */
const prisma = new PrismaClient();

const DAY1 = new Date("2026-08-01T00:00:00.000Z");
const DAY2 = new Date("2026-08-02T00:00:00.000Z");

async function main() {
  // Product hierarchy: Type > Family > Line > Product.
  const beverages = await prisma.productType.create({ data: { name: "Beverages" } });
  const softDrinks = await prisma.productFamily.create({
    data: { name: "Soft Drinks", productTypeId: beverages.id },
  });
  const cola = await prisma.productLine.create({
    data: { name: "Cola", productFamilyId: softDrinks.id },
  });

  const acme = await prisma.brand.create({ data: { brandName: "Acme" } });
  const zesti = await prisma.brand.create({ data: { brandName: "Zesti" } });

  const colaClassic = await prisma.product.create({
    data: { skuNumber: "SKU-0001", productName: "Cola Classic 12oz", productLineId: cola.id, brandId: acme.id },
  });
  const colaZero = await prisma.product.create({
    data: { skuNumber: "SKU-0002", productName: "Cola Zero 12oz", productLineId: cola.id, brandId: zesti.id },
  });

  // Stores: two in East, one in West.
  const eastMain = await prisma.store.create({
    data: {
      storeKey: "E-001", name: "East Main", region: "East", state: "VA", city: "Richmond",
      zipCode: "23220", latitude: 37.5407, longitude: -77.436, tier: "A",
    },
  });
  const eastRiver = await prisma.store.create({
    data: {
      storeKey: "E-002", name: "East River", region: "East", state: "VA", city: "Norfolk",
      zipCode: "23510", latitude: 36.8508, longitude: -76.2859, tier: "B",
    },
  });
  const westPeak = await prisma.store.create({
    data: {
      storeKey: "W-001", name: "West Peak", region: "West", state: "CA", city: "Fresno",
      zipCode: "93721", latitude: 36.7378, longitude: -119.7871, tier: "A",
    },
  });

  // Helper to reduce InventoryDaily boilerplate.
  const snap = (
    snapshotDate: Date, storeId: number, productId: number,
    unitsOnHand: number, isLowStock: boolean, inventoryValue: number
  ) =>
    prisma.inventoryDaily.create({
      data: {
        snapshotDate, storeId, productId,
        costPerUnit: 0.5, unitsOnHand, unitsOnOrder: 10, unitsInTransit: 5,
        unitsReceived: 20, unitsShrunk: 1, reorderPoint: 15, maxStockLevel: 100,
        daysOfSupply: 12.5, inventoryValue, isStockout: unitsOnHand === 0, isLowStock,
        lostSalesUnits: 0, lostSalesValue: 0, leadTimeDays: 3, merchantId: "M-01",
      },
    });

  // Day 1 (older) and Day 2 (latest).
  await snap(DAY1, eastMain.id, colaClassic.id, 90, false, 45);
  await snap(DAY1, eastMain.id, colaZero.id, 80, false, 40);

  await snap(DAY2, eastMain.id, colaClassic.id, 12, true, 6);   // low now
  await snap(DAY2, eastMain.id, colaZero.id, 70, false, 35);
  await snap(DAY2, eastRiver.id, colaClassic.id, 8, true, 4);   // low now
  await snap(DAY2, westPeak.id, colaClassic.id, 50, false, 25);

  // Adjustments for Cola Classic at East Main.
  await prisma.inventoryAdjustment.createMany({
    data: [
      { storeId: eastMain.id, productId: colaClassic.id, adjustedBy: "alice", adjustedAt: DAY1, unitsDelta: -5, reason: "Damage", serialNumber: "ADJ-1001" },
      { storeId: eastMain.id, productId: colaClassic.id, adjustedBy: "bob", adjustedAt: DAY2, unitsDelta: -3, reason: "Shrinkage", serialNumber: "ADJ-1002" },
    ],
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
