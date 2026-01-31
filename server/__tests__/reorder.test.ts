import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createApp } from "../app.js";
import { createTestDb } from "../test-utils.js";
import type { DbInstance } from "../app.js";
import type { WatchItem, WatchItemCreate, ReorderPayload } from "../../shared/types.js";

let db: DbInstance;
let close: () => void;
let app: ReturnType<typeof createApp>;

const makeItem = (title: string, tmdbId: number): WatchItemCreate => ({
  tmdbId,
  mediaType: "movie",
  title,
  originalTitle: null,
  originalLanguage: "en",
  posterPath: null,
  year: "2024",
  note: `Adding ${title}`,
  addedBy: "Alice",
});

function req(path: string, init?: RequestInit) {
  const url = path === "/" ? "/api/items" : `/api/items${path}`;
  return app.request(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

async function createItem(title: string, tmdbId: number): Promise<WatchItem> {
  const res = await req("/", {
    method: "POST",
    body: JSON.stringify(makeItem(title, tmdbId)),
  });
  return (await res.json()) as WatchItem;
}

beforeEach(() => {
  ({ db, close } = createTestDb());
  app = createApp(db);
});

afterEach(() => {
  close();
});

describe("POST /api/items/reorder", () => {
  it("reorders items by updating positions", async () => {
    const a = await createItem("A", 1);
    const b = await createItem("B", 2);
    const c = await createItem("C", 3);

    // Original order: A(0), B(1), C(2)
    // New order: C(0), A(1), B(2)
    const payload: ReorderPayload[] = [
      { itemId: c.id, newPosition: 0 },
      { itemId: a.id, newPosition: 1 },
      { itemId: b.id, newPosition: 2 },
    ];

    const res = await req("/reorder", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);

    const listRes = await req("/");
    const items = (await listRes.json()) as WatchItem[];
    expect(items[0]!.title).toBe("C");
    expect(items[1]!.title).toBe("A");
    expect(items[2]!.title).toBe("B");
  });

  it("handles moving a single item to a different position", async () => {
    const a = await createItem("A", 1);
    const b = await createItem("B", 2);
    const c = await createItem("C", 3);

    // Move C to position 0, shift others
    const payload: ReorderPayload[] = [
      { itemId: c.id, newPosition: 0 },
      { itemId: a.id, newPosition: 1 },
      { itemId: b.id, newPosition: 2 },
    ];

    await req("/reorder", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const listRes = await req("/");
    const items = (await listRes.json()) as WatchItem[];
    expect(items.map((i) => i.title)).toEqual(["C", "A", "B"]);
  });

  it("handles reordering a single item list (no-op)", async () => {
    const a = await createItem("A", 1);

    const payload: ReorderPayload[] = [{ itemId: a.id, newPosition: 0 }];
    const res = await req("/reorder", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);

    const listRes = await req("/");
    const items = (await listRes.json()) as WatchItem[];
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("A");
  });

  it("handles complete reversal of list order", async () => {
    const a = await createItem("A", 1);
    const b = await createItem("B", 2);
    const c = await createItem("C", 3);
    const d = await createItem("D", 4);

    const payload: ReorderPayload[] = [
      { itemId: d.id, newPosition: 0 },
      { itemId: c.id, newPosition: 1 },
      { itemId: b.id, newPosition: 2 },
      { itemId: a.id, newPosition: 3 },
    ];

    await req("/reorder", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const listRes = await req("/");
    const items = (await listRes.json()) as WatchItem[];
    expect(items.map((i) => i.title)).toEqual(["D", "C", "B", "A"]);
  });

  it("preserves positions after add following reorder", async () => {
    const a = await createItem("A", 1);
    const b = await createItem("B", 2);

    // Reverse: B, A
    await req("/reorder", {
      method: "POST",
      body: JSON.stringify([
        { itemId: b.id, newPosition: 0 },
        { itemId: a.id, newPosition: 1 },
      ]),
    });

    // Add new item — should go to end
    const c = await createItem("C", 3);

    const listRes = await req("/");
    const items = (await listRes.json()) as WatchItem[];
    expect(items.map((i) => i.title)).toEqual(["B", "A", "C"]);
  });
});
