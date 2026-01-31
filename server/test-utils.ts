import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./db/schema.js";
import type { DbInstance } from "./app.js";

/**
 * Creates a fresh in-memory database for each test.
 * Returns the drizzle instance and a cleanup function.
 */
export function createTestDb(): { db: DbInstance; close: () => void } {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle" });
  return { db: testDb, close: () => sqlite.close() };
}
