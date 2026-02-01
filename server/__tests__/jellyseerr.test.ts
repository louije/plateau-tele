import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { createApp } from "../app.js";
import { createTestDb } from "../test-utils.js";
import type { DbInstance } from "../app.js";

let db: DbInstance;
let close: () => void;
let app: ReturnType<typeof createApp>;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  ({ db, close } = createTestDb());
  app = createApp(db);
  originalFetch = globalThis.fetch;
  process.env.TMDB_API_KEY = "test-key";
  process.env.JELLYSEERR_URL = "http://jellyseerr:5055";
  process.env.JELLYSEERR_API_KEY = "test-api-key";
});

afterEach(() => {
  close();
  globalThis.fetch = originalFetch;
  delete process.env.JELLYSEERR_URL;
  delete process.env.JELLYSEERR_API_KEY;
});

describe("POST /api/jellyseerr/request", () => {
  it("proxies a movie request to Jellyseerr", async () => {
    const calls: { url: string; body: string }[] = [];
    globalThis.fetch = mock((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, body: init?.body as string });
      return Promise.resolve(
        new Response(JSON.stringify({ id: 1, status: 2, type: "movie" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof fetch;

    const res = await app.request("/api/jellyseerr/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId: 550, mediaType: "movie" }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://jellyseerr:5055/api/v1/request");
    const sentBody = JSON.parse(calls[0]!.body);
    expect(sentBody.mediaType).toBe("movie");
    expect(sentBody.mediaId).toBe(550);
  });

  it("sends seasons=all for TV requests", async () => {
    const calls: { body: string }[] = [];
    globalThis.fetch = mock((_input: string | URL | Request, init?: RequestInit) => {
      calls.push({ body: init?.body as string });
      return Promise.resolve(
        new Response(JSON.stringify({ id: 2, status: 2, type: "tv" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof fetch;

    const res = await app.request("/api/jellyseerr/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId: 1396, mediaType: "tv" }),
    });

    expect(res.status).toBe(200);
    const sentBody = JSON.parse(calls[0]!.body);
    expect(sentBody.seasons).toBe("all");
  });

  it("returns 400 for missing fields", async () => {
    const res = await app.request("/api/jellyseerr/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid mediaType", async () => {
    const res = await app.request("/api/jellyseerr/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId: 550, mediaType: "person" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 502 when Jellyseerr returns an error", async () => {
    globalThis.fetch = mock(() => {
      return Promise.resolve(new Response("Internal Error", { status: 500 }));
    }) as typeof fetch;

    const res = await app.request("/api/jellyseerr/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId: 550, mediaType: "movie" }),
    });
    expect(res.status).toBe(502);
  });

  it("returns 502 when Jellyseerr is not configured", async () => {
    delete process.env.JELLYSEERR_URL;
    delete process.env.JELLYSEERR_API_KEY;

    const res = await app.request("/api/jellyseerr/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId: 550, mediaType: "movie" }),
    });
    expect(res.status).toBe(502);
  });
});

describe("POST /api/jellyseerr/batch-status", () => {
  it("returns statuses for multiple items", async () => {
    globalThis.fetch = mock((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/movie/550")) {
        return Promise.resolve(
          new Response(JSON.stringify({ mediaInfo: { status: 5 } }), {
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("/tv/1396")) {
        return Promise.resolve(
          new Response(JSON.stringify({}), {
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }) as typeof fetch;

    const res = await app.request("/api/jellyseerr/batch-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { tmdbId: 550, mediaType: "movie" },
          { tmdbId: 1396, mediaType: "tv" },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { tmdbId: number; status: string }[];
    expect(json).toHaveLength(2);
    expect(json[0]).toEqual({ tmdbId: 550, mediaType: "movie", status: "available" });
    expect(json[1]).toEqual({ tmdbId: 1396, mediaType: "tv", status: "unavailable" });
  });

  it("maps Jellyseerr status 2 to requested", async () => {
    globalThis.fetch = mock(() => {
      return Promise.resolve(
        new Response(JSON.stringify({ mediaInfo: { status: 2 } }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof fetch;

    const res = await app.request("/api/jellyseerr/batch-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ tmdbId: 550, mediaType: "movie" }] }),
    });

    const json = (await res.json()) as { status: string }[];
    expect(json[0]!.status).toBe("requested");
  });

  it("maps Jellyseerr status 3 to processing", async () => {
    globalThis.fetch = mock(() => {
      return Promise.resolve(
        new Response(JSON.stringify({ mediaInfo: { status: 3 } }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof fetch;

    const res = await app.request("/api/jellyseerr/batch-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ tmdbId: 550, mediaType: "movie" }] }),
    });

    const json = (await res.json()) as { status: string }[];
    expect(json[0]!.status).toBe("processing");
  });

  it("returns 400 for empty items", async () => {
    const res = await app.request("/api/jellyseerr/batch-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("returns unavailable when Jellyseerr is unreachable", async () => {
    globalThis.fetch = mock(() => {
      return Promise.reject(new Error("ECONNREFUSED"));
    }) as typeof fetch;

    const res = await app.request("/api/jellyseerr/batch-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ tmdbId: 550, mediaType: "movie" }] }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string }[];
    expect(json[0]!.status).toBe("unavailable");
  });
});
