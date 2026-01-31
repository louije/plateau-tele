import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDetails } from "../tmdb.js";
import * as schema from "../db/schema.js";
import { renderDetailPage } from "../views/detail.js";
import { renderAddModal } from "../views/add-modal.js";
import { resolveLocale } from "../../shared/i18n/index.js";
import type { AppEnv } from "../app.js";
import type { MediaType } from "../../shared/types.js";

const detail = new Hono<AppEnv>();

detail.get("/:type/:id/add", async (c) => {
  const mediaType = c.req.param("type") as MediaType;
  const tmdbId = Number(c.req.param("id"));

  if ((mediaType !== "movie" && mediaType !== "tv") || isNaN(tmdbId)) {
    return c.notFound();
  }

  const tmdbData = await getDetails(tmdbId, mediaType);
  if (!tmdbData) return c.notFound();

  const locale = resolveLocale(c.req.header("Accept-Language") ?? "");
  const searchQuery = c.req.query("q") || null;

  return c.html(
    renderAddModal({ tmdbData, mediaType, tmdbId, locale, searchQuery }),
  );
});

detail.get("/:type/:id", async (c) => {
  const mediaType = c.req.param("type") as MediaType;
  const tmdbId = Number(c.req.param("id"));

  if ((mediaType !== "movie" && mediaType !== "tv") || isNaN(tmdbId)) {
    return c.notFound();
  }

  const tmdbData = await getDetails(tmdbId, mediaType);
  if (!tmdbData) return c.notFound();

  const db = c.var.db;
  const existing = db
    .select({ id: schema.watchItems.id, watched: schema.watchItems.watched })
    .from(schema.watchItems)
    .where(
      and(
        eq(schema.watchItems.tmdbId, tmdbId),
        eq(schema.watchItems.mediaType, mediaType),
      ),
    )
    .get();

  const locale = resolveLocale(c.req.header("Accept-Language") ?? "");

  const searchQuery = c.req.query("q") || null;

  return c.html(
    renderDetailPage({
      tmdbData,
      mediaType,
      tmdbId,
      existingItem: existing ?? null,
      locale,
      searchQuery,
    }),
  );
});

export { detail };
