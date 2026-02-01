import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { createApp } from "./app.js";
import { db, runMigrations } from "./db/index.js";
import { existsSync } from "node:fs";

// Run migrations then start
try {
  runMigrations();
} catch (e) {
  console.log("Migrations skipped (run db:generate first):", (e as Error).message);
}

const api = createApp(db);
const transpiler = new Bun.Transpiler({ loader: "ts" });

// Wrap in a parent app that also serves static files
const server = new Hono();
server.route("/", api);

// Vendor: serve sortablejs ESM from node_modules
server.get("/vendor/sortable.esm.js", async (c) => {
  const file = Bun.file("node_modules/sortablejs/modular/sortable.esm.js");
  c.header("Content-Type", "application/javascript");
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return c.body(await file.text());
});

// Transpile shared/ TS → JS on the fly
server.get("/shared/*", async (c, next) => {
  const reqPath = c.req.path;
  if (!reqPath.endsWith(".js")) return next();
  const tsPath = `shared${reqPath.slice(7).replace(/\.js$/, ".ts")}`;
  if (!existsSync(tsPath)) return next();
  const source = await Bun.file(tsPath).text();
  const js = transpiler.transformSync(source);
  c.header("Content-Type", "application/javascript");
  return c.body(js);
});

// Transpile client/ TS → JS on the fly
server.get("/*", async (c, next) => {
  if (!c.req.path.endsWith(".js")) return next();
  const tsPath = `client${c.req.path.replace(/\.js$/, ".ts")}`;
  if (!existsSync(tsPath)) return next();
  const source = await Bun.file(tsPath).text();
  const js = transpiler.transformSync(source);
  c.header("Content-Type", "application/javascript");
  return c.body(js);
});

// Static files: CSS, HTML, images, icons
server.use("/styles/*", serveStatic({ root: "./client" }));
server.use("/styles.css", serveStatic({ root: "./client" }));
server.use("/icons/*", serveStatic({ root: "./client" }));
server.use("/plateau-tele.png", serveStatic({ root: "./shared" }));
server.use("/index.html", serveStatic({ root: "./client" }));

// SPA fallback
server.get("/*", serveStatic({ root: "./client", path: "index.html" }));

const port = Number(process.env.PORT) || 3000;

export default {
  port,
  fetch: server.fetch,
};

console.log(`plateau-télé running on http://localhost:${port}`);
