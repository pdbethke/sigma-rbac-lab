// .claude/skills/performance/scanNPlusOne.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@typescript-eslint/typescript-estree";

export type Rule = "query-in-loop" | "unincluded-relation";

export interface Finding {
  file: string;
  line: number;
  rule: Rule;
  message: string;
}

const QUERY_METHODS = new Set([
  "findMany", "findUnique", "findFirst", "findUniqueOrThrow", "findFirstOrThrow",
  "count", "aggregate", "groupBy", "create", "update", "upsert", "delete",
]);
const ITERATING_METHODS = new Set(["map", "forEach", "flatMap", "filter", "reduce"]);
const LOOP_TYPES = new Set([
  "ForStatement", "ForOfStatement", "ForInStatement", "WhileStatement", "DoWhileStatement",
]);

type Node = Record<string, any>;

function walk(node: Node | null, visit: (n: Node) => void): void {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === "object") walk(value as Node, visit);
  }
}

/** The method name of a call like prisma.model.findMany(...). */
function queryMethodName(node: Node): string | null {
  if (node.type !== "CallExpression") return null;
  const callee = node.callee;
  if (callee?.type !== "MemberExpression" || callee.property?.type !== "Identifier") return null;
  const name = callee.property.name as string;
  return QUERY_METHODS.has(name) ? name : null;
}

/** Bodies that execute once per element: real loops, and callbacks to map/forEach/etc. */
function iteratedBodies(tree: Node): Node[] {
  const bodies: Node[] = [];
  walk(tree, (node) => {
    if (LOOP_TYPES.has(node.type) && node.body) bodies.push(node.body);
    if (node.type === "CallExpression") {
      const callee = node.callee;
      if (
        callee?.type === "MemberExpression" &&
        callee.property?.type === "Identifier" &&
        ITERATING_METHODS.has(callee.property.name)
      ) {
        for (const argument of node.arguments ?? []) {
          if (
            argument.type === "ArrowFunctionExpression" ||
            argument.type === "FunctionExpression"
          ) {
            bodies.push(argument.body);
          }
        }
      }
    }
  });
  return bodies;
}

/**
 * Names of variables bound (via a plain `const x = await prisma.model.findX(...)`,
 * with no `.field` access chained onto the call, no destructuring) to a query result
 * whose options object named neither `include` nor `select`. Only these variables are
 * considered "unincluded query results" for the relation rule below — the rule never
 * fires on a chain rooted at any other identifier.
 */
function unincludedResults(tree: Node): Set<string> {
  const names = new Set<string>();
  walk(tree, (node) => {
    if (node.type !== "VariableDeclarator" || node.id?.type !== "Identifier") return;
    let init = node.init;
    if (init?.type === "AwaitExpression") init = init.argument;
    if (!queryMethodName(init ?? {})) return;
    const options = init.arguments?.[0];
    const keys =
      options?.type === "ObjectExpression"
        ? (options.properties ?? [])
            .filter((p: Node) => p.key?.type === "Identifier")
            .map((p: Node) => p.key.name as string)
        : [];
    if (!keys.includes("include") && !keys.includes("select")) names.add(node.id.name);
  });
  return names;
}

/**
 * For each iterated body, the loop-local binding(s) that alias an element of an
 * unincluded query result: `for (const item of items)` where `items` is unincluded
 * binds `item` the same way. Only identifiers bound this way (or the unincluded
 * variable itself, for direct access without a loop) are valid roots for the
 * relation rule.
 */
function unincludedElementNames(body: Node, loopNode: Node | null, unincluded: Set<string>): Set<string> {
  const names = new Set<string>();
  if (
    loopNode &&
    (loopNode.type === "ForOfStatement" || loopNode.type === "ForInStatement") &&
    loopNode.left?.type === "VariableDeclaration"
  ) {
    const decl = loopNode.left.declarations?.[0];
    const right = loopNode.right;
    if (decl?.id?.type === "Identifier" && right?.type === "Identifier" && unincluded.has(right.name)) {
      names.add(decl.id.name);
    }
  }
  return names;
}

/**
 * The root identifier and depth of a member-access chain, e.g. `item.product.brand`
 * rooted at `item` with depth 2. Returns null for chains not rooted at a plain
 * identifier (e.g. `this.x.y`, `foo().x.y`, computed access `a[b].c`).
 */
function chainRoot(node: Node): { name: string; depth: number } | null {
  let depth = 0;
  let current: Node = node;
  while (current.type === "MemberExpression") {
    if (current.computed) return null;
    depth += 1;
    current = current.object;
  }
  return current.type === "Identifier" ? { name: current.name, depth } : null;
}

export function scanSource(source: string, filename = "<memory>"): Finding[] {
  let tree: Node;
  try {
    tree = parse(source, { loc: true, jsx: false }) as unknown as Node;
  } catch {
    return [];
  }

  const findings: Finding[] = [];
  const unincluded = unincludedResults(tree);

  // Pair each iterated body with the loop/call node that produced it, so we can
  // recover `for (const item of items)` bindings for the relation rule.
  const bodyPairs: Array<{ body: Node; loop: Node | null }> = [];
  walk(tree, (node) => {
    if (LOOP_TYPES.has(node.type) && node.body) bodyPairs.push({ body: node.body, loop: node });
    if (node.type === "CallExpression") {
      const callee = node.callee;
      if (
        callee?.type === "MemberExpression" &&
        callee.property?.type === "Identifier" &&
        ITERATING_METHODS.has(callee.property.name)
      ) {
        for (const argument of node.arguments ?? []) {
          if (argument.type === "ArrowFunctionExpression" || argument.type === "FunctionExpression") {
            bodyPairs.push({ body: argument.body, loop: null });
          }
        }
      }
    }
  });

  for (const { body, loop } of bodyPairs) {
    const validRoots = new Set(unincluded);
    for (const name of unincludedElementNames(body, loop, unincluded)) validRoots.add(name);

    // Reported member-expression sites already flagged in this body, keyed by root
    // identifier: only the shallowest access per root triggers a finding, so
    // `item.product.brand.brandName` reports once, not once per `.` in the chain.
    const reportedRoots = new Set<string>();

    walk(body, (node) => {
      const method = queryMethodName(node);
      if (method) {
        findings.push({
          file: filename,
          line: node.loc?.start.line ?? 0,
          rule: "query-in-loop",
          message:
            `Query .${method}() runs once per iteration. Fetch the set in one query, ` +
            `or use include to load the relation with its parent.`,
        });
        return;
      }

      if (node.type !== "MemberExpression") return;
      const root = chainRoot(node);
      // Require depth >= 2 (e.g. item.product.brand) so a single-level access like
      // item.product is never flagged on its own -- Prisma always returns the
      // record's own scalar fields; the risk is walking *into* a relation.
      if (!root || root.depth < 2) return;
      if (!validRoots.has(root.name)) return;
      if (reportedRoots.has(root.name)) return;
      reportedRoots.add(root.name);
      findings.push({
        file: filename,
        line: node.loc?.start.line ?? 0,
        rule: "unincluded-relation",
        message:
          "Relation read on a record fetched without include or select. Each access " +
          "may issue its own query.",
      });
    });
  }

  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.file}:${finding.line}:${finding.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function scanPath(root: string): Finding[] {
  const findings: Finding[] = [];
  const skip = new Set(["node_modules", ".git", "migrations", "dist", "runs"]);
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) visit(full);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry) && !/\.test\./.test(entry)) {
        findings.push(...scanSource(readFileSync(full, "utf8"), full));
      }
    }
  };
  visit(root);
  return findings;
}

function main(): void {
  const root = process.argv[2] ?? "app";
  const findings = scanPath(root);
  if (findings.length === 0) {
    console.log(`N+1 scan: no candidates in ${root}`);
    return;
  }
  console.log(`N+1 scan: ${findings.length} candidate(s) in ${root}`);
  for (const finding of findings) {
    console.log(`  ${finding.file}:${finding.line}  [${finding.rule}] ${finding.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
