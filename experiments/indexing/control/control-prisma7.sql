-- CreateTable
CREATE TABLE "Store" (
    "storeId" TEXT NOT NULL PRIMARY KEY,
    "storeKey" TEXT NOT NULL,
    "storeName" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ProductType" (
    "productTypeId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ProductFamily" (
    "productFamilyId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "productTypeId" TEXT NOT NULL,
    CONSTRAINT "ProductFamily_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "ProductType" ("productTypeId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductLine" (
    "productLineId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "productFamilyId" TEXT NOT NULL,
    CONSTRAINT "ProductLine_productFamilyId_fkey" FOREIGN KEY ("productFamilyId") REFERENCES "ProductFamily" ("productFamilyId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Brand" (
    "brandId" TEXT NOT NULL PRIMARY KEY,
    "brandName" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "productId" TEXT NOT NULL PRIMARY KEY,
    "skuNumber" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productLineId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    CONSTRAINT "Product_productLineId_fkey" FOREIGN KEY ("productLineId") REFERENCES "ProductLine" ("productLineId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("brandId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryDaily" (
    "snapshotDate" DATETIME NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitsOnHand" INTEGER NOT NULL,
    "isLowStock" BOOLEAN NOT NULL,

    PRIMARY KEY ("snapshotDate", "storeId", "productId"),
    CONSTRAINT "InventoryDaily_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("storeId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryDaily_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("productId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryAdjustment" (
    "adjustmentId" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "adjustedAt" DATETIME NOT NULL,
    "unitsDelta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    CONSTRAINT "InventoryAdjustment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("storeId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("productId") ON DELETE RESTRICT ON UPDATE CASCADE
);

