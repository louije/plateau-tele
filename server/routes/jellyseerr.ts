import { Hono } from "hono";
import { requestMedia } from "../jellyseerr.js";
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

export { jellyseerr };
