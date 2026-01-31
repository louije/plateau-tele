import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./db/schema.js";
import type { DbInstance } from "./app.js";

/**
 * Creates a fresh in-memory database for each test.
 * Returns the drizzle instance and a cleanup function.
 */
export function createTestDb(): { db: DbInstance; close: () => void } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle" });
  return { db: testDb, close: () => sqlite.close() };
}
