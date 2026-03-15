import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as schema from "./db/schema.js";
import { items } from "./routes/items.js";
import { search } from "./routes/search.js";
import { events } from "./routes/events.js";
import { detail } from "./routes/detail.js";
import { jellyseerr } from "./routes/jellyseerr.js";
import { tunefind } from "./routes/tunefind.js";

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

  app.get("/healthz", (c) => {
    const db = c.get("db");
    db.run(sql`SELECT 1`);
    return c.json({ status: "ok" });
  });

  app.route("/api/items", items);
  app.route("/api/search", search);
  app.route("/api/events", events);
  app.route("/detail", detail);
  app.route("/api/jellyseerr", jellyseerr);
  app.route("/api/tunefind", tunefind);

  app.onError((err, c) => {
    console.error(err.message);
    return c.json({ error: "internal server error" }, 500);
  });

  return app;
}
