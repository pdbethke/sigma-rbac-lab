import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIndexes } from "./parseIndexes.ts";

const ORACLE_INDEXES = [
  { table: "assignments", columns: ["user_id", "status"] },
  { table: "permissions", columns: ["role_id"] },
  { table: "inventory_daily", columns: ["store_id", "snapshot_date"] },
  { table: "inventory_adjustments", columns: ["store_id", "product_id"] },
];

describe("parseIndexes", () => {
  it("parses the oracle schema exactly", () => {
    const sql = readFileSync(new URL("../../oracle/schema.sql", import.meta.url), "utf8");
    expect(parseIndexes(sql)).toEqual(ORACLE_INDEXES);
  });

  it("parses the shape Prisma emits, with no space before the paren", () => {
    const sql =
      'CREATE INDEX "InventoryDaily_storeId_snapshotDate_idx" ON "InventoryDaily"("storeId", "snapshotDate");';
    expect(parseIndexes(sql)).toEqual([
      { table: "inventorydaily", columns: ["storeid", "snapshotdate"] },
    ]);
  });

  it("handles UNIQUE, IF NOT EXISTS, and identifiers containing spaces", () => {
    const sql = 'CREATE UNIQUE INDEX IF NOT EXISTS "idx_a" ON "Orders" ("Customer Id", placed_at);';
    expect(parseIndexes(sql)).toEqual([
      { table: "orders", columns: ["customer id", "placed_at"] },
    ]);
  });

  it("drops sort and collation suffixes from column names", () => {
    const sql = "CREATE INDEX idx_b ON t (a DESC, b COLLATE NOCASE);";
    expect(parseIndexes(sql)).toEqual([{ table: "t", columns: ["a", "b"] }]);
  });

  it("ignores commented-out indexes and CREATE TABLE", () => {
    const sql = [
      "-- CREATE INDEX idx_commented ON t (a);",
      "CREATE TABLE t (id TEXT PRIMARY KEY);",
      "CREATE INDEX idx_real ON t (a, b);",
    ].join("\n");
    expect(parseIndexes(sql)).toEqual([{ table: "t", columns: ["a", "b"] }]);
  });

  it("returns an empty array when there are no indexes", () => {
    expect(parseIndexes("CREATE TABLE t (id TEXT PRIMARY KEY);")).toEqual([]);
  });
});
