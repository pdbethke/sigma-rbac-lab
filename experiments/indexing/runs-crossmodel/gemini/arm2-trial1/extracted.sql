-- CreateTable
CREATE TABLE "Store" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "storeKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "tier" TEXT NOT NULL
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
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productLineId" INTEGER NOT NULL,
    "brandId" INTEGER NOT NULL,
    CONSTRAINT "Product_productLineId_fkey" FOREIGN KEY ("productLineId") REFERENCES "ProductLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryDaily" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshotDate" DATETIME NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
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
    "merchantId" TEXT NOT NULL,
    CONSTRAINT "InventoryDaily_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryDaily_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryAdjustment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "storeId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "whoAdjusted" TEXT NOT NULL,
    "when" DATETIME NOT NULL,
    "unitsDelta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    CONSTRAINT "InventoryAdjustment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_storeKey_key" ON "Store"("storeKey");

-- CreateIndex
CREATE INDEX "Store_region_idx" ON "Store"("region");

-- CreateIndex
CREATE INDEX "ProductFamily_productTypeId_idx" ON "ProductFamily"("productTypeId");

-- CreateIndex
CREATE INDEX "ProductLine_productFamilyId_idx" ON "ProductLine"("productFamilyId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_productLineId_idx" ON "Product"("productLineId");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE INDEX "InventoryDaily_storeId_snapshotDate_idx" ON "InventoryDaily"("storeId", "snapshotDate");

-- CreateIndex
CREATE INDEX "InventoryDaily_snapshotDate_storeId_idx" ON "InventoryDaily"("snapshotDate", "storeId");

-- CreateIndex
CREATE INDEX "InventoryDaily_isLowStock_storeId_idx" ON "InventoryDaily"("isLowStock", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDaily_storeId_productId_snapshotDate_key" ON "InventoryDaily"("storeId", "productId", "snapshotDate");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_storeId_productId_when_idx" ON "InventoryAdjustment"("storeId", "productId", "when");

