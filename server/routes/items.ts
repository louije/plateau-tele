import { Hono } from "hono";
import { eq, asc, sql } from "drizzle-orm";
import { broadcast } from "../sse.js";
import * as schema from "../db/schema.js";
import type { AppEnv } from "../app.js";
import type { WatchItem, WatchItemCreate, ReorderPayload } from "../../shared/types.js";

const items = new Hono<AppEnv>();

function rowToItem(row: typeof schema.watchItems.$inferSelect): WatchItem {
  return {
    id: row.id,
    tmdbId: row.tmdbId,
    mediaType: row.mediaType,
    title: row.title,
    originalTitle: row.originalTitle,
    originalLanguage: row.originalLanguage,
    posterPath: row.posterPath,
    year: row.year,
    note: row.note,
    addedBy: row.addedBy,
    director: row.director,
    country: row.country,
    duration: row.duration,
    position: row.position,
    watched: row.watched,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// GET /api/items — list all unwatched, ordered by position
items.get("/", (c) => {
  const db = c.var.db;
  const showWatched = c.req.query("watched") === "true";
  const rows = db
    .select()
    .from(schema.watchItems)
    .where(eq(schema.watchItems.watched, showWatched))
    .orderBy(asc(schema.watchItems.position))
    .all();
  return c.json(rows.map(rowToItem));
});

// POST /api/items — add a new item to the list
items.post("/", async (c) => {
  const db = c.var.db;
  const body = await c.req.json<WatchItemCreate & { addToTop?: boolean }>();

  let position: number;

  if (body.addToTop) {
    // Shift all unwatched items down by 1
    db.update(schema.watchItems)
      .set({ position: sql`${schema.watchItems.position} + 1` })
      .where(eq(schema.watchItems.watched, false))
      .run();
    position = 0;
  } else {
    const maxRow = db
      .select({ maxPos: sql<number>`coalesce(max(${schema.watchItems.position}), -1)` })
      .from(schema.watchItems)
      .get();
    position = (maxRow?.maxPos ?? -1) + 1;
  }

  const inserted = db
    .insert(schema.watchItems)
    .values({
      tmdbId: body.tmdbId,
      mediaType: body.mediaType,
      title: body.title,
      originalTitle: body.originalTitle,
      originalLanguage: body.originalLanguage,
      posterPath: body.posterPath,
      year: body.year,
      note: body.note,
      addedBy: body.addedBy,
      director: body.director ?? null,
      country: body.country ?? null,
      duration: body.duration ?? null,
      position,
    })
    .returning()
    .get();

  const item = rowToItem(inserted);

  if (body.addToTop) {
    const allItems = db
      .select({ id: schema.watchItems.id, position: schema.watchItems.position })
      .from(schema.watchItems)
      .where(eq(schema.watchItems.watched, false))
      .all();
    broadcast({ type: "item:reordered", items: allItems });
  }

  broadcast({ type: "item:added", item });
  return c.json(item, 201);
});

// PATCH /api/items/:id — update note, watched status, etc.
items.patch("/:id", async (c) => {
  const db = c.var.db;
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Partial<Pick<WatchItem, "note" | "watched">>>();

  const updated = db
    .update(schema.watchItems)
    .set({
      ...body,
      updatedAt: sql`datetime('now')`,
    })
    .where(eq(schema.watchItems.id, id))
    .returning()
    .get();

  if (!updated) return c.json({ error: "not found" }, 404);

  const item = rowToItem(updated);
  if (body.watched !== undefined) {
    broadcast({ type: "item:watched", item });
  } else {
    broadcast({ type: "item:updated", item });
  }
  return c.json(item);
});

// DELETE /api/items/:id
items.delete("/:id", (c) => {
  const db = c.var.db;
  const id = Number(c.req.param("id"));
  db.delete(schema.watchItems).where(eq(schema.watchItems.id, id)).run();
  broadcast({ type: "item:removed", itemId: id });
  return c.json({ ok: true });
});

// POST /api/items/reorder — reorder the list
items.post("/reorder", async (c) => {
  const db = c.var.db;
  const body = await c.req.json<ReorderPayload[]>();

  const results: { id: number; position: number }[] = [];
  for (const { itemId, newPosition } of body) {
    db.update(schema.watchItems)
      .set({ position: newPosition, updatedAt: sql`datetime('now')` })
      .where(eq(schema.watchItems.id, itemId))
      .run();
    results.push({ id: itemId, position: newPosition });
  }

  broadcast({ type: "item:reordered", items: results });
  return c.json({ ok: true });
});

export { items };
