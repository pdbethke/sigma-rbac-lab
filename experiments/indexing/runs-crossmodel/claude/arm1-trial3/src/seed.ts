import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Small deterministic seed: 2 regions, 3 stores, a product hierarchy, and two
 * snapshot dates of InventoryDaily plus a few adjustments. Enough to exercise
 * every query in queries.ts.
 */
async function main() {
  // Wipe (child-first) so the seed is idempotent.
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryDaily.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productLine.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.store.deleteMany();

  const west = await prisma.store.create({
    data: {
      storeKey: "SEA-01",
      name: "Seattle Downtown",
      region: "West",
      state: "WA",
      city: "Seattle",
      zipCode: "98101",
      latitude: 47.6062,
      longitude: -122.3321,
      tier: "Flagship",
    },
  });
  const west2 = await prisma.store.create({
    data: {
      storeKey: "PDX-01",
      name: "Portland Pearl",
      region: "West",
      state: "OR",
      city: "Portland",
      zipCode: "97209",
      latitude: 45.5289,
      longitude: -122.6837,
      tier: "Standard",
    },
  });
  const east = await prisma.store.create({
    data: {
      storeKey: "NYC-01",
      name: "Manhattan Flatiron",
      region: "East",
      state: "NY",
      city: "New York",
      zipCode: "10010",
      latitude: 40.7411,
      longitude: -73.9897,
      tier: "Flagship",
    },
  });

  const electronics = await prisma.productType.create({
    data: { name: "Electronics" },
  });
  const audio = await prisma.productFamily.create({
    data: { name: "Audio", productTypeId: electronics.id },
  });
  const headphones = await prisma.productLine.create({
    data: { name: "Headphones", productFamilyId: audio.id },
  });
  const speakers = await prisma.productLine.create({
    data: { name: "Speakers", productFamilyId: audio.id },
  });

  const acme = await prisma.brand.create({ data: { name: "Acme" } });
  const zenith = await prisma.brand.create({ data: { name: "Zenith" } });

  const p1 = await prisma.product.create({
    data: { sku: "SKU-1001", name: "Acme Over-Ear 100", productLineId: headphones.id, brandId: acme.id },
  });
  const p2 = await prisma.product.create({
    data: { sku: "SKU-1002", name: "Zenith Earbuds Pro", productLineId: headphones.id, brandId: zenith.id },
  });
  const p3 = await prisma.product.create({
    data: { sku: "SKU-2001", name: "Acme BoomBox 8", productLineId: speakers.id, brandId: acme.id },
  });

  const day1 = new Date("2026-07-31T00:00:00.000Z");
  const day2 = new Date("2026-08-01T00:00:00.000Z");

  const baseDaily = {
    unitsOnOrder: 0,
    unitsInTransit: 0,
    unitsReceived: 0,
    unitsShrunk: 0,
    reorderPoint: 10,
    maxStockLevel: 100,
    daysOfSupply: 12.5,
    isStockout: false,
    lostSalesUnits: 0,
    lostSalesValue: 0,
    leadTimeDays: 7,
    merchantId: "M-100",
  };

  const daily = (
    date: Date,
    storeId: number,
    productId: number,
    costPerUnit: number,
    unitsOnHand: number,
    isLowStock: boolean
  ) => ({
    ...baseDaily,
    snapshotDate: date,
    storeId,
    productId,
    costPerUnit,
    unitsOnHand,
    inventoryValue: costPerUnit * unitsOnHand,
    isLowStock,
  });

  await prisma.inventoryDaily.createMany({
    data: [
      // West / Seattle
      daily(day1, west.id, p1.id, 80, 40, false),
      daily(day2, west.id, p1.id, 80, 35, false),
      daily(day2, west.id, p2.id, 60, 5, true),
      daily(day2, west.id, p3.id, 120, 8, true),
      // West / Portland
      daily(day2, west2.id, p1.id, 82, 50, false),
      daily(day2, west2.id, p2.id, 61, 4, true),
      // East / NYC
      daily(day2, east.id, p1.id, 85, 20, false),
      daily(day2, east.id, p3.id, 125, 2, true),
    ],
  });

  await prisma.inventoryAdjustment.createMany({
    data: [
      {
        storeId: west.id,
        productId: p2.id,
        adjustedBy: "amaya.chen",
        adjustedAt: new Date("2026-08-01T14:30:00.000Z"),
        unitsDelta: -3,
        reason: "Damaged in handling",
        serialNumber: "ADJ-0001",
      },
      {
        storeId: west.id,
        productId: p2.id,
        adjustedBy: "devon.park",
        adjustedAt: new Date("2026-08-01T18:05:00.000Z"),
        unitsDelta: 10,
        reason: "Cycle count correction",
        serialNumber: "ADJ-0002",
      },
    ],
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
