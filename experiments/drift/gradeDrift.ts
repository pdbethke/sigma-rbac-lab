/**
 * Grading for the drift experiments (Tasks 15-19), derived from committed
 * artifacts rather than from numbers anyone typed.
 *
 * Every increment directory carries an `indexes.txt` — the harness's
 * `grep -nE '@@(index|unique)\(' schema.prisma` snapshot taken after the session
 * finished. Diffing increment N against N-1 gives exactly what that session
 * added, which is the unit of measurement.
 *
 * WHAT THIS DOES NOT GRADE: the `flagged` outcome — a session that declared no
 * index but named the right one in prose. That lives in the transcript, not the
 * schema, and it is a judgment. It is carried in a committed annotations file
 * beside the mechanical grade rather than guessed at here, so the two kinds of
 * claim stay visibly separate.
 */

export type Outcome = "correct" | "partial" | "none" | "flagged";

export interface PrismaIndex {
  kind: "index" | "unique";
  columns: string[];
}

export interface Expectation {
  increment: number;
  columns: string[];
  table: string;
}

/**
 * The pre-registered targets, transcribed from EXPECTED.md, which was committed
 * at 63cdf40 on 2026-08-02 15:27:03 — before the first session ran. A test
 * asserts each of these appears verbatim in that file, so this constant cannot
 * drift away from the frozen expectation without turning the suite red.
 */
export const EXPECTED_BY_INCREMENT: Expectation[] = [
  { increment: 1, table: "InventoryAdjustment", columns: ["adjustedat"] },
  { increment: 2, table: "InventoryAdjustment", columns: ["adjustedby", "adjustedat"] },
  { increment: 3, table: "InventoryDaily", columns: ["snapshotdate", "isstockout"] },
  { increment: 4, table: "InventoryDaily", columns: ["productid", "snapshotdate"] },
];

const DECLARATION = /@@(index|unique)\(\[([^\]]*)\]/g;

/** Parse the harness's line-numbered snapshot into declarations, in file order. */
export function parsePrismaIndexes(text: string): PrismaIndex[] {
  const found: PrismaIndex[] = [];
  for (const match of text.matchAll(DECLARATION)) {
    const columns = match[2]
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c.length > 0);
    found.push({ kind: match[1] as "index" | "unique", columns });
  }
  return found;
}

const key = (index: PrismaIndex): string => index.columns.join(",");

/**
 * What this increment added, ignoring @@unique. The unique constraint is part of
 * the baseline's grain and our own prompt dictates it, so crediting it would
 * credit the session for our sentence — the same error caught in Task 4.
 */
export function newIndexes(before: PrismaIndex[], after: PrismaIndex[]): PrismaIndex[] {
  const seen = new Set(before.filter((i) => i.kind === "index").map(key));
  return after.filter((i) => i.kind === "index" && !seen.has(key(i)));
}

/**
 * correct — an added index whose columns are exactly the expected tuple, in order.
 * partial — an added index that touches the expected columns but is not that tuple:
 *           wrong order, a prefix, or a superset. Right instinct, wrong shape.
 * none    — nothing added that relates to the expected columns.
 */
export function gradeIncrement(
  added: PrismaIndex[],
  expected: { columns: string[] },
): Outcome {
  if (added.length === 0) return "none";
  const target = expected.columns.join(",");
  if (added.some((i) => key(i) === target)) return "correct";

  const wanted = new Set(expected.columns);
  const touches = added.some((i) => i.columns.some((c) => wanted.has(c)));
  return touches ? "partial" : "none";
}
