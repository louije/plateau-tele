import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createApp } from "../app.js";
import { createTestDb } from "../test-utils.js";
import * as schema from "../db/schema.js";
import type { DbInstance } from "../app.js";
import type { WatchItem, WatchItemCreate } from "../../shared/types.js";

let db: DbInstance;
let close: () => void;
let app: ReturnType<typeof createApp>;

const sampleItem: WatchItemCreate = {
  tmdbId: 550,
  mediaType: "movie",
  title: "Fight Club",
  originalTitle: null,
  originalLanguage: "en",
  posterPath: "/poster.jpg",
  year: "1999",
  note: "Brad Pitt is great in this",
  addedBy: "Alice",
};

function req(path: string, init?: RequestInit) {
  // Strip leading slash to avoid /api/items/ (trailing slash 404 in Hono)
  const stripped = path.startsWith("/") ? path.slice(1) : path;
  const url = stripped ? `/api/items/${stripped}` : "/api/items";
  return app.request(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  ({ db, close } = createTestDb());
  app = createApp(db);
});

afterEach(() => {
  close();
});

describe("GET /api/items", () => {
  it("returns empty array when no items exist", async () => {
    const res = await req("/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as WatchItem[];
    expect(body).toEqual([]);
  });

  it("returns only unwatched items by default", async () => {
    // Add two items, mark one as watched
    await req("/", { method: "POST", body: JSON.stringify(sampleItem) });
    const res2 = await req("/", {
      method: "POST",
      body: JSON.stringify({ ...sampleItem, title: "The Matrix", tmdbId: 603 }),
    });
    const matrix = (await res2.json()) as WatchItem;
    await req(`/${matrix.id}`, {
      method: "PATCH",
      body: JSON.stringify({ watched: true }),
    });

    const res = await req("/");
    const items = (await res.json()) as WatchItem[];
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Fight Club");
  });

  it("returns watched items when ?watched=true", async () => {
    const createRes = await req("/", {
      method: "POST",
      body: JSON.stringify(sampleItem),
    });
    const item = (await createRes.json()) as WatchItem;
    await req(`/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ watched: true }),
    });

    const res = await app.request("/api/items?watched=true");
    const items = (await res.json()) as WatchItem[];
    expect(items).toHaveLength(1);
    expect(items[0]!.watched).toBe(true);
  });

  it("orders watched items by watchedAt DESC", async () => {
    // Create three items and watch them in a known order.
    const a = (await (
      await req("/", { method: "POST", body: JSON.stringify(sampleItem) })
    ).json()) as WatchItem;
    const b = (await (
      await req("/", {
        method: "POST",
        body: JSON.stringify({ ...sampleItem, tmdbId: 603, title: "The Matrix" }),
      })
    ).json()) as WatchItem;
    const c = (await (
      await req("/", {
        method: "POST",
        body: JSON.stringify({ ...sampleItem, tmdbId: 27205, title: "Inception" }),
      })
    ).json()) as WatchItem;

    // Watch in the order: a, c, b — so the latest-watched order is b, c, a.
    await req(`/${a.id}`, { method: "PATCH", body: JSON.stringify({ watched: true }) });
    await new Promise((r) => setTimeout(r, 1100));
    await req(`/${c.id}`, { method: "PATCH", body: JSON.stringify({ watched: true }) });
    await new Promise((r) => setTimeout(r, 1100));
    await req(`/${b.id}`, { method: "PATCH", body: JSON.stringify({ watched: true }) });

    const res = await app.request("/api/items?watched=true");
    const items = (await res.json()) as WatchItem[];
    expect(items.map((i) => i.title)).toEqual([
      "The Matrix",
      "Inception",
      "Fight Club",
    ]);
  });

  it("breaks ties on watchedAt by id DESC", async () => {
    // Seed rows directly with an identical watchedAt so the tiebreak clause fires.
    const now = "2026-04-12 14:00:00";
    db.insert(schema.watchItems).values([
      { tmdbId: 1, mediaType: "movie", title: "First",  originalLanguage: "en", position: 0, watched: true,  watchedAt: now, addedBy: "A" },
      { tmdbId: 2, mediaType: "movie", title: "Second", originalLanguage: "en", position: 1, watched: true,  watchedAt: now, addedBy: "A" },
      { tmdbId: 3, mediaType: "movie", title: "Third",  originalLanguage: "en", position: 2, watched: true,  watchedAt: now, addedBy: "A" },
    ]).run();

    const res = await app.request("/api/items?watched=true");
    const items = (await res.json()) as WatchItem[];
    // All three share watchedAt, so order is purely id DESC — insertion order
    // reversed (drizzle auto-increments ids).
    expect(items.map((i) => i.title)).toEqual(["Third", "Second", "First"]);
  });

  it("returns items ordered by position", async () => {
    await req("/", { method: "POST", body: JSON.stringify(sampleItem) });
    await req("/", {
      method: "POST",
      body: JSON.stringify({ ...sampleItem, title: "The Matrix", tmdbId: 603 }),
    });
    await req("/", {
      method: "POST",
      body: JSON.stringify({ ...sampleItem, title: "Inception", tmdbId: 27205 }),
    });

    const res = await req("/");
    const items = (await res.json()) as WatchItem[];
    expect(items).toHaveLength(3);
    expect(items[0]!.position).toBeLessThan(items[1]!.position);
    expect(items[1]!.position).toBeLessThan(items[2]!.position);
  });
});

describe("POST /api/items", () => {
  it("creates a new item and returns 201", async () => {
    const res = await req("/", {
      method: "POST",
      body: JSON.stringify(sampleItem),
    });
    expect(res.status).toBe(201);

    const item = (await res.json()) as WatchItem;
    expect(item.id).toBeGreaterThan(0);
    expect(item.tmdbId).toBe(550);
    expect(item.mediaType).toBe("movie");
    expect(item.title).toBe("Fight Club");
    expect(item.posterPath).toBe("/poster.jpg");
    expect(item.year).toBe("1999");
    expect(item.note).toBe("Brad Pitt is great in this");
    expect(item.addedBy).toBe("Alice");
    expect(item.watched).toBe(false);
    expect(item.position).toBe(0);
    expect(item.createdAt).toBeTruthy();
    expect(item.updatedAt).toBeTruthy();
  });

  it("assigns incrementing positions", async () => {
    const res1 = await req("/", {
      method: "POST",
      body: JSON.stringify(sampleItem),
    });
    const res2 = await req("/", {
      method: "POST",
      body: JSON.stringify({ ...sampleItem, tmdbId: 603, title: "The Matrix" }),
    });

    const item1 = (await res1.json()) as WatchItem;
    const item2 = (await res2.json()) as WatchItem;
    expect(item1.position).toBe(0);
    expect(item2.position).toBe(1);
  });

  it("handles null posterPath and year", async () => {
    const res = await req("/", {
      method: "POST",
      body: JSON.stringify({
        ...sampleItem,
        posterPath: null,
        year: null,
      }),
    });
    const item = (await res.json()) as WatchItem;
    expect(item.posterPath).toBeNull();
    expect(item.year).toBeNull();
  });

  it("adds item to top when addToTop is true", async () => {
    await req("/", { method: "POST", body: JSON.stringify(sampleItem) });
    await req("/", {
      method: "POST",
      body: JSON.stringify({ ...sampleItem, title: "The Matrix", tmdbId: 603 }),
    });

    const res = await req("/", {
      method: "POST",
      body: JSON.stringify({
        ...sampleItem,
        title: "Inception",
        tmdbId: 27205,
        addToTop: true,
      }),
    });
    const created = (await res.json()) as WatchItem;
    expect(created.position).toBe(0);

    const listRes = await req("/");
    const items = (await listRes.json()) as WatchItem[];
    expect(items.map((i) => i.title)).toEqual([
      "Inception",
      "Fight Club",
      "The Matrix",
    ]);
  });
});

describe("PATCH /api/items/:id", () => {
  it("updates the note on an existing item", async () => {
    const createRes = await req("/", {
      method: "POST",
      body: JSON.stringify(sampleItem),
    });
    const created = (await createRes.json()) as WatchItem;

    const patchRes = await req(`/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ note: "Actually even better than I thought" }),
    });
    expect(patchRes.status).toBe(200);

    const patched = (await patchRes.json()) as WatchItem;
    expect(patched.note).toBe("Actually even better than I thought");
    expect(patched.id).toBe(created.id);
  });

  it("marks an item as watched", async () => {
    const createRes = await req("/", {
      method: "POST",
      body: JSON.stringify(sampleItem),
    });
    const created = (await createRes.json()) as WatchItem;

    const patchRes = await req(`/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ watched: true }),
    });
    const patched = (await patchRes.json()) as WatchItem;
    expect(patched.watched).toBe(true);
  });

  it("returns 404 for non-existent item", async () => {
    const res = await req("/9999", {
      method: "PATCH",
      body: JSON.stringify({ note: "nope" }),
    });
    expect(res.status).toBe(404);
  });

  it("sets updatedAt to a valid datetime on patch", async () => {
    const createRes = await req("/", {
      method: "POST",
      body: JSON.stringify(sampleItem),
    });
    const created = (await createRes.json()) as WatchItem;

    const patchRes = await req(`/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ note: "new note" }),
    });
    const patched = (await patchRes.json()) as WatchItem;
    // updatedAt should be a valid datetime string
    expect(Date.parse(patched.updatedAt)).not.toBeNaN();
    // updatedAt should be >= createdAt
    expect(Date.parse(patched.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(created.createdAt),
    );
  });
});

describe("DELETE /api/items/:id", () => {
  it("removes an item from the list", async () => {
    const createRes = await req("/", {
      method: "POST",
      body: JSON.stringify(sampleItem),
    });
    const created = (await createRes.json()) as WatchItem;

    const delRes = await req(`/${created.id}`, { method: "DELETE" });
    expect(delRes.status).toBe(200);

    const listRes = await req("/");
    const items = (await listRes.json()) as WatchItem[];
    expect(items).toHaveLength(0);
  });

  it("succeeds silently for non-existent items", async () => {
    const res = await req("/9999", { method: "DELETE" });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/items/:id — watched_at handling", () => {
  it("sets watchedAt when watched flips to true", async () => {
    const createRes = await req("/", {
      method: "POST",
      body: JSON.stringify(sampleItem),
    });
    const created = (await createRes.json()) as WatchItem;
    expect(created.watchedAt).toBeNull();

    const patchRes = await req(`/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ watched: true }),
    });
    const patched = (await patchRes.json()) as WatchItem;
    expect(patched.watched).toBe(true);
    expect(patched.watchedAt).toBeTruthy();
    expect(Date.parse(patched.watchedAt!)).not.toBeNaN();
  });

  it("clears watchedAt when watched flips back to false", async () => {
    const createRes = await req("/", {
      method: "POST",
      body: JSON.stringify(sampleItem),
    });
    const created = (await createRes.json()) as WatchItem;

    await req(`/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ watched: true }),
    });
    const patchRes = await req(`/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ watched: false }),
    });
    const patched = (await patchRes.json()) as WatchItem;
    expect(patched.watched).toBe(false);
    expect(patched.watchedAt).toBeNull();
  });

  it("leaves watchedAt untouched on note-only edits", async () => {
    const createRes = await req("/", {
      method: "POST",
      body: JSON.stringify(sampleItem),
    });
    const created = (await createRes.json()) as WatchItem;
    const watchRes = await req(`/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ watched: true }),
    });
    const firstWatchedAt = ((await watchRes.json()) as WatchItem).watchedAt;

    // Wait a tick so datetime('now') would differ if touched
    await new Promise((r) => setTimeout(r, 1100));

    const noteRes = await req(`/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ note: "updated reason" }),
    });
    const afterNote = (await noteRes.json()) as WatchItem;
    expect(afterNote.note).toBe("updated reason");
    expect(afterNote.watchedAt).toBe(firstWatchedAt);
  });
});
