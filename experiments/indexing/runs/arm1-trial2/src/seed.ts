import { prisma } from "./client.js";

const YESTERDAY = new Date("2026-08-01T00:00:00.000Z");
const TODAY = new Date("2026-08-02T00:00:00.000Z");

async function main() {
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryDaily.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productLine.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.store.deleteMany();

  const type = await prisma.productType.create({ data: { name: "Beverage" } });
  const family = await prisma.productFamily.create({
    data: { name: "Sparkling Water", productTypeId: type.id },
  });
  const line = await prisma.productLine.create({
    data: { name: "Citrus", productFamilyId: family.id },
  });
  const brand = await prisma.brand.create({ data: { brandName: "Vellum" } });

  const lime = await prisma.product.create({
    data: {
      skuNumber: "SKU-1001",
      productName: "Lime 12oz",
      productLineId: line.id,
      brandId: brand.id,
    },
  });
  const grapefruit = await prisma.product.create({
    data: {
      skuNumber: "SKU-1002",
      productName: "Grapefruit 12oz",
      productLineId: line.id,
      brandId: brand.id,
    },
  });

  const northA = await prisma.store.create({
    data: {
      storeKey: "N-001",
      name: "Northgate",
      region: "North",
      state: "VA",
      city: "Charlottesville",
      zipCode: "22902",
      latitude: 38.03,
      longitude: -78.48,
      tier: "A",
    },
  });
  const northB = await prisma.store.create({
    data: {
      storeKey: "N-002",
      name: "Rivanna",
      region: "North",
      state: "VA",
      city: "Richmond",
      zipCode: "23220",
      latitude: 37.54,
      longitude: -77.44,
      tier: "B",
    },
  });
  const south = await prisma.store.create({
    data: {
      storeKey: "S-001",
      name: "Southpoint",
      region: "South",
      state: "NC",
      city: "Durham",
      zipCode: "27713",
      latitude: 35.9,
      longitude: -78.94,
      tier: "A",
    },
  });

  const snapshot = (
    storeId: number,
    productId: number,
    snapshotDate: Date,
    unitsOnHand: number,
    isLowStock: boolean,
    inventoryValue: number,
  ) => ({
    snapshotDate,
    storeId,
    productId,
    costPerUnit: 1.25,
    unitsOnHand,
    unitsOnOrder: 10,
    unitsInTransit: 4,
    unitsReceived: 6,
    unitsShrunk: 1,
    reorderPoint: 20,
    maxStockLevel: 200,
    daysOfSupply: 5.5,
    inventoryValue,
    isStockout: unitsOnHand === 0,
    isLowStock,
    lostSalesUnits: 0,
    lostSalesValue: 0,
    leadTimeDays: 3,
    merchantId: "M-77",
  });

  await prisma.inventoryDaily.createMany({
    data: [
      // Stale snapshot — page 1 must not return these.
      snapshot(northA.id, lime.id, YESTERDAY, 999, false, 1248.75),
      snapshot(northA.id, grapefruit.id, YESTERDAY, 999, false, 1248.75),
      // Latest snapshot.
      snapshot(northA.id, lime.id, TODAY, 12, true, 15.0),
      snapshot(northA.id, grapefruit.id, TODAY, 140, false, 175.0),
      snapshot(northB.id, lime.id, TODAY, 8, true, 10.0),
      snapshot(northB.id, grapefruit.id, TODAY, 90, false, 112.5),
      snapshot(south.id, lime.id, TODAY, 3, true, 3.75),
    ],
  });

  await prisma.inventoryAdjustment.createMany({
    data: [
      {
        storeId: northA.id,
        productId: lime.id,
        adjustedBy: "dana.k",
        adjustedAt: new Date("2026-07-30T14:00:00.000Z"),
        unitsDelta: -6,
        reason: "Damage",
        serialNumber: "ADJ-0001",
      },
      {
        storeId: northA.id,
        productId: lime.id,
        adjustedBy: "morgan.p",
        adjustedAt: new Date("2026-08-01T09:30:00.000Z"),
        unitsDelta: 24,
        reason: "Cycle count",
        serialNumber: "ADJ-0002",
      },
      // Different product at the same store — must not leak into page 3.
      {
        storeId: northA.id,
        productId: grapefruit.id,
        adjustedBy: "rey.s",
        adjustedAt: new Date("2026-08-01T10:00:00.000Z"),
        unitsDelta: -2,
        reason: "Shrink",
        serialNumber: "ADJ-0003",
      },
    ],
  });

  console.log("seeded");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
