import { Hono } from "hono";
import { searchMulti, getDetails } from "../tmdb.js";
import type { MediaType } from "../../shared/types.js";

const search = new Hono();

// GET /api/search?q=...
search.get("/", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q || q.length < 2) return c.json([]);

  const results = await searchMulti(q);
  return c.json(results);
});

// GET /api/details/:type/:id
search.get("/details/:type/:id", async (c) => {
  const mediaType = c.req.param("type") as MediaType;
  const tmdbId = Number(c.req.param("id"));

  if (mediaType !== "movie" && mediaType !== "tv") {
    return c.json({ error: "invalid type" }, 400);
  }

  const details = await getDetails(tmdbId, mediaType);
  if (!details) return c.json({ error: "not found" }, 404);
  return c.json(details);
});

export { search };
