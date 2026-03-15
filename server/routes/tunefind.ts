import { Hono } from "hono";
import { getTunefindData } from "../tunefind.js";
import type { AppEnv } from "../app.js";

const tunefind = new Hono<AppEnv>();

tunefind.get("/", async (c) => {
  const title = c.req.query("title");
  const type = c.req.query("type") as "movie" | "tv" | undefined;
  const year = c.req.query("year") || null;

  if (!title || (type !== "movie" && type !== "tv")) {
    return c.json({ error: "invalid params" }, 400);
  }

  const result = await getTunefindData(title, type, year);
  if (!result) return c.json(null, 404);
  return c.json(result);
});

export { tunefind };
