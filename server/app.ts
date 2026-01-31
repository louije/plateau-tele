import { Hono } from "hono";
import { cors } from "hono/cors";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as schema from "./db/schema.js";
import { items } from "./routes/items.js";
import { search } from "./routes/search.js";
import { events } from "./routes/events.js";
import { detail } from "./routes/detail.js";

export type DbInstance = BunSQLiteDatabase<typeof schema>;

export type AppEnv = {
  Variables: {
    db: DbInstance;
  };
};

export function createApp(db: DbInstance) {
  const app = new Hono<AppEnv>();

  app.use("*", cors());

  // Inject db into context for all routes
  app.use("*", async (c, next) => {
    c.set("db", db);
    await next();
  });

  app.route("/api/items", items);
  app.route("/api/search", search);
  app.route("/api/events", events);
  app.route("/detail", detail);

  app.onError((err, c) => {
    console.error(err.message);
    return c.json({ error: "internal server error" }, 500);
  });

  return app;
}
