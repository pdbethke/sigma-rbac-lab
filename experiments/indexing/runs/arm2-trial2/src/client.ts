import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client.js";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url }),
    log: ["warn", "error"],
  });
}

/**
 * One client per process. Under a dev server that reloads modules, reuse the
 * client stashed on globalThis so we don't leak a connection pool per reload.
 */
export const prisma = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
