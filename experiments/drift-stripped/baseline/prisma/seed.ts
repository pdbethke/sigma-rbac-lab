import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DAY_1 = new Date("2026-07-31T00:00:00.000Z");
const DAY_2 = new Date("2026-08-01T00:00:00.000Z");

async function main() {
  // Clean slate so the seed is idempotent.
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryDaily.deleteMany();
  await prisma.product.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.productLine.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.store.deleteMany();

  // --- Stores ---------------------------------------------------------------
  const austin = await prisma.store.create({
    data: {
      storeKey: "TX-AUS-01",
      name: "Austin Central",
      region: "South",
      state: "TX",
      city: "Austin",
      zipCode: "78701",
      latitude: 30.2672,
      longitude: -97.7431,
      tier: "flagship",
    },
  });
  const dallas = await prisma.store.create({
    data: {
      storeKey: "TX-DAL-01",
      name: "Dallas Uptown",
      region: "South",
      state: "TX",
      city: "Dallas",
      zipCode: "75201",
      latitude: 32.7767,
      longitude: -96.797,
      tier: "standard",
    },
  });
  const seattle = await prisma.store.create({
    data: {
      storeKey: "WA-SEA-01",
      name: "Seattle Waterfront",
      region: "Northwest",
      state: "WA",
      city: "Seattle",
      zipCode: "98101",
      latitude: 47.6062,
      longitude: -122.3321,
      tier: "standard",
    },
  });

  // --- Product hierarchy ----------------------------------------------------
  const electronics = await prisma.productType.create({
    data: { name: "Electronics" },
  });
  const audioFamily = await prisma.productFamily.create({
    data: { name: "Audio", productTypeId: electronics.id },
  });
  const computingFamily = await prisma.productFamily.create({
    data: { name: "Computing", productTypeId: electronics.id },
  });
  const headphoneLine = await prisma.productLine.create({
    data: { name: "Headphones", productFamilyId: audioFamily.id },
  });
  const speakerLine = await prisma.productLine.create({
    data: { name: "Speakers", productFamilyId: audioFamily.id },
  });
  const laptopLine = await prisma.productLine.create({
    data: { name: "Laptops", productFamilyId: computingFamily.id },
  });

  const acme = await prisma.brand.create({ data: { name: "Acme" } });
  const globex = await prisma.brand.create({ data: { name: "Globex" } });

  const headphones = await prisma.product.create({
    data: {
      sku: "ACM-HP-100",
      name: "Acme Studio Headphones",
      productLineId: headphoneLine.id,
      brandId: acme.id,
    },
  });
  const speaker = await prisma.product.create({
    data: {
      sku: "GLX-SP-200",
      name: "Globex Boom Speaker",
      productLineId: speakerLine.id,
      brandId: globex.id,
    },
  });
  const laptop = await prisma.product.create({
    data: {
      sku: "ACM-LT-300",
      name: "Acme UltraBook 14",
      productLineId: laptopLine.id,
      brandId: acme.id,
    },
  });

  // --- InventoryDaily -------------------------------------------------------
  // Helper to keep the many-field rows readable.
  const snapshot = (
    date: Date,
    storeId: number,
    productId: number,
    unitsOnHand: number,
    costPerUnit: number,
    isLowStock: boolean
  ) => ({
    snapshotDate: date,
    storeId,
    productId,
    costPerUnit,
    unitsOnHand,
    unitsOnOrder: 10,
    unitsInTransit: 2,
    unitsReceived: 5,
    unitsShrunk: 0,
    reorderPoint: 15,
    maxStockLevel: 100,
    daysOfSupply: unitsOnHand / 2,
    inventoryValue: unitsOnHand * costPerUnit,
    isStockout: unitsOnHand === 0,
    isLowStock,
    lostSalesUnits: isLowStock ? 3 : 0,
    lostSalesValue: isLowStock ? 3 * costPerUnit : 0,
    leadTimeDays: 7,
    merchantId: "MERCH-001",
  });

  await prisma.inventoryDaily.createMany({
    data: [
      // Day 1 — Austin
      snapshot(DAY_1, austin.id, headphones.id, 40, 80, false),
      snapshot(DAY_1, austin.id, speaker.id, 25, 50, false),
      // Day 2 — Austin (latest for Austin)
      snapshot(DAY_2, austin.id, headphones.id, 8, 80, true),
      snapshot(DAY_2, austin.id, speaker.id, 22, 50, false),
      snapshot(DAY_2, austin.id, laptop.id, 30, 900, false),
      // Day 2 — Dallas
      snapshot(DAY_2, dallas.id, headphones.id, 12, 80, true),
      snapshot(DAY_2, dallas.id, laptop.id, 5, 900, true),
      // Day 2 — Seattle (different region)
      snapshot(DAY_2, seattle.id, speaker.id, 9, 50, true),
    ],
  });

  // --- InventoryAdjustments -------------------------------------------------
  await prisma.inventoryAdjustment.createMany({
    data: [
      {
        storeId: austin.id,
        productId: headphones.id,
        adjustedBy: "jsmith",
        adjustedAt: new Date("2026-07-31T14:00:00.000Z"),
        unitsDelta: -2,
        reason: "damage",
        serialNumber: "ADJ-0001",
      },
      {
        storeId: austin.id,
        productId: headphones.id,
        adjustedBy: "mlopez",
        adjustedAt: new Date("2026-08-01T09:30:00.000Z"),
        unitsDelta: -3,
        reason: "cycle count correction",
        serialNumber: "ADJ-0002",
      },
      {
        storeId: austin.id,
        productId: speaker.id,
        adjustedBy: "jsmith",
        adjustedAt: new Date("2026-08-01T10:00:00.000Z"),
        unitsDelta: 5,
        reason: "found stock",
        serialNumber: "ADJ-0003",
      },
    ],
  });

  console.log("Seed complete.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
