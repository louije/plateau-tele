import { Hono } from "hono";
import { requestMedia, cancelRequest, getMediaAvailability } from "../jellyseerr.js";
import type { AppEnv } from "../app.js";
import type { MediaType } from "../../shared/types.js";

const jellyseerr = new Hono<AppEnv>();

jellyseerr.post("/request", async (c) => {
  const body = await c.req.json<{ tmdbId: number; mediaType: MediaType }>();

  if (!body.tmdbId || !body.mediaType) {
    return c.json({ error: "tmdbId and mediaType required" }, 400);
  }
  if (body.mediaType !== "movie" && body.mediaType !== "tv") {
    return c.json({ error: "invalid mediaType" }, 400);
  }

  const result = await requestMedia(body.tmdbId, body.mediaType);
  if (!result.ok) {
    return c.json({ error: result.error }, 502);
  }
  return c.json({ ok: true });
});

jellyseerr.delete("/request/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id || !Number.isInteger(id)) {
    return c.json({ error: "valid request id required" }, 400);
  }

  const result = await cancelRequest(id);
  if (!result.ok) {
    return c.json({ error: result.error }, 502);
  }
  return c.json({ ok: true });
});

jellyseerr.post("/batch-status", async (c) => {
  const body = await c.req.json<{ items: { tmdbId: number; mediaType: MediaType }[] }>();

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: "items array required" }, 400);
  }

  const results = await Promise.all(
    body.items.map(async ({ tmdbId, mediaType }) => {
      const { status } = await getMediaAvailability(tmdbId, mediaType);
      return { tmdbId, mediaType, status };
    }),
  );

  return c.json(results);
});

export { jellyseerr };
