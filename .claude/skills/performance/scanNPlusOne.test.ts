// .claude/skills/performance/scanNPlusOne.test.ts
import { describe, expect, it } from "vitest";
import { scanSource } from "./scanNPlusOne.ts";

const rules = (source: string) => scanSource(source).map((f) => f.rule).sort();

describe("scanSource", () => {
  it("flags an awaited query inside a for-of loop", () => {
    const source = `
      for (const store of stores) {
        const items = await prisma.inventoryDaily.findMany({ where: { storeId: store.storeId } });
      }
    `;
    expect(rules(source)).toEqual(["query-in-loop"]);
  });

  it("flags an awaited query inside a map callback", () => {
    const source = `
      const counts = await Promise.all(
        products.map((p) => prisma.inventoryAdjustment.count({ where: { productId: p.productId } }))
      );
    `;
    expect(rules(source)).toEqual(["query-in-loop"]);
  });

  it("flags a relation walk on a findMany result that declared no include", () => {
    const source = `
      const items = await prisma.inventoryDaily.findMany({ where: { storeId } });
      for (const item of items) {
        const brand = item.product.brand.brandName;
      }
    `;
    expect(rules(source)).toEqual(["unincluded-relation"]);
  });

  it("does not flag a relation walk when include was declared", () => {
    const source = `
      const items = await prisma.inventoryDaily.findMany({
        where: { storeId },
        include: { product: { include: { brand: true } } },
      });
      for (const item of items) {
        const brand = item.product.brand.brandName;
      }
    `;
    expect(rules(source)).toEqual([]);
  });

  it("does not flag a select that names the fields", () => {
    const source = `
      const items = await prisma.inventoryDaily.findMany({
        where: { storeId },
        select: { unitsOnHand: true, product: { select: { productName: true } } },
      });
      for (const item of items) {
        const name = item.product.productName;
      }
    `;
    expect(rules(source)).toEqual([]);
  });

  it("does not flag a loop that runs no query and walks no relation", () => {
    const source = `
      for (const n of [1, 2, 3]) {
        console.log(n);
      }
    `;
    expect(rules(source)).toEqual([]);
  });

  it("does not flag a single query outside any loop", () => {
    const source = `const items = await prisma.inventoryDaily.findMany({ where: { storeId } });`;
    expect(rules(source)).toEqual([]);
  });

  it("reports file and line", () => {
    const source = "for (const s of stores) {\n  await prisma.product.findUnique({ where: { id: s.id } });\n}";
    const findings = scanSource(source, "queries.ts");
    expect(findings[0].file).toBe("queries.ts");
    expect(findings[0].line).toBe(2);
  });
});
