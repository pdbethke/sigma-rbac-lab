-- CreateTable
CREATE TABLE "Store" (
    "storeKey" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "tier" TEXT
);

-- CreateTable
CREATE TABLE "ProductType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ProductFamily" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "productTypeId" INTEGER NOT NULL,
    CONSTRAINT "ProductFamily_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "ProductType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "productFamilyId" INTEGER NOT NULL,
    CONSTRAINT "ProductLine_productFamilyId_fkey" FOREIGN KEY ("productFamilyId") REFERENCES "ProductFamily" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "skuNumber" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "productLineId" INTEGER NOT NULL,
    "brandId" INTEGER NOT NULL,
    CONSTRAINT "Product_productLineId_fkey" FOREIGN KEY ("productLineId") REFERENCES "ProductLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryDaily" (
    "snapshotDate" DATETIME NOT NULL,
    "storeKey" TEXT NOT NULL,
    "skuNumber" TEXT NOT NULL,
    "costPerUnit" REAL NOT NULL,
    "unitsOnHand" INTEGER NOT NULL,
    "unitsOnOrder" INTEGER NOT NULL,
    "unitsInTransit" INTEGER NOT NULL,
    "unitsReceived" INTEGER NOT NULL,
    "unitsShrunk" INTEGER NOT NULL,
    "reorderPoint" INTEGER NOT NULL,
    "maxStockLevel" INTEGER NOT NULL,
    "daysOfSupply" REAL NOT NULL,
    "inventoryValue" REAL NOT NULL,
    "isStockout" BOOLEAN NOT NULL,
    "isLowStock" BOOLEAN NOT NULL,
    "lostSalesUnits" INTEGER NOT NULL,
    "lostSalesValue" REAL NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "merchantId" TEXT,

    PRIMARY KEY ("snapshotDate", "storeKey", "skuNumber"),
    CONSTRAINT "InventoryDaily_storeKey_fkey" FOREIGN KEY ("storeKey") REFERENCES "Store" ("storeKey") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryDaily_skuNumber_fkey" FOREIGN KEY ("skuNumber") REFERENCES "Product" ("skuNumber") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryAdjustment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "storeKey" TEXT NOT NULL,
    "skuNumber" TEXT NOT NULL,
    "adjustedBy" TEXT NOT NULL,
    "adjustedAt" DATETIME NOT NULL,
    "unitsDelta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "serialNumber" TEXT,
    CONSTRAINT "InventoryAdjustment_storeKey_fkey" FOREIGN KEY ("storeKey") REFERENCES "Store" ("storeKey") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryAdjustment_skuNumber_fkey" FOREIGN KEY ("skuNumber") REFERENCES "Product" ("skuNumber") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Store_region_idx" ON "Store"("region");

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_name_key" ON "ProductType"("name");

-- CreateIndex
CREATE INDEX "ProductFamily_productTypeId_idx" ON "ProductFamily"("productTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFamily_productTypeId_name_key" ON "ProductFamily"("productTypeId", "name");

-- CreateIndex
CREATE INDEX "ProductLine_productFamilyId_idx" ON "ProductLine"("productFamilyId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductLine_productFamilyId_name_key" ON "ProductLine"("productFamilyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE INDEX "Product_productLineId_idx" ON "Product"("productLineId");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE INDEX "InventoryDaily_storeKey_snapshotDate_idx" ON "InventoryDaily"("storeKey", "snapshotDate");

-- CreateIndex
CREATE INDEX "InventoryDaily_storeKey_skuNumber_snapshotDate_idx" ON "InventoryDaily"("storeKey", "skuNumber", "snapshotDate");

-- CreateIndex
CREATE INDEX "InventoryDaily_isLowStock_snapshotDate_idx" ON "InventoryDaily"("isLowStock", "snapshotDate");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_storeKey_skuNumber_adjustedAt_idx" ON "InventoryAdjustment"("storeKey", "skuNumber", "adjustedAt");

