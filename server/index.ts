import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createApp } from "./app.js";
import { db, runMigrations } from "./db/index.js";

// Run migrations then start
try {
  runMigrations();
} catch (e) {
  console.log("Migrations skipped (run db:generate first):", (e as Error).message);
}

const api = createApp(db);

// Wrap in a parent app that also serves static files
const server = new Hono();
server.route("/", api);
server.use("/*", serveStatic({ root: "./dist/public" }));
server.get("/*", serveStatic({ root: "./dist/public", path: "index.html" }));

const port = Number(process.env.PORT) || 3000;

serve({ fetch: server.fetch, port }, () => {
  console.log(`plateau-télé running on http://localhost:${port}`);
});
