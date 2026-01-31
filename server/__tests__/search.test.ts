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
});

afterEach(() => {
  close();
  globalThis.fetch = originalFetch;
});

const tmdbMultiResponse = {
  results: [
    {
      id: 550,
      media_type: "movie",
      title: "Fight Club",
      poster_path: "/poster550.jpg",
      release_date: "1999-10-15",
      overview: "An insomniac office worker...",
    },
    {
      id: 1396,
      media_type: "tv",
      name: "Breaking Bad",
      poster_path: "/poster1396.jpg",
      first_air_date: "2008-01-20",
      overview: "A high school chemistry teacher...",
    },
    {
      id: 999,
      media_type: "person",
      name: "Some Person",
      known_for: [
        {
          id: 550,
          media_type: "movie",
          title: "Fight Club",
          poster_path: "/poster550.jpg",
          release_date: "1999-10-15",
          overview: "An insomniac office worker...",
          popularity: 50,
        },
      ],
    },
  ],
};

describe("GET /api/search", () => {
  it("returns empty array for short queries", async () => {
    const res = await app.request("/api/search?q=a");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns empty array for empty query", async () => {
    const res = await app.request("/api/search?q=");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns empty array for missing query", async () => {
    const res = await app.request("/api/search");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("proxies TMDB search and filters results", async () => {
    process.env.TMDB_API_KEY = "test-key";

    const movieDetail = {
      runtime: 139,
      origin_country: ["US"],
      credits: { crew: [{ job: "Director", name: "David Fincher" }] },
    };
    const tvDetail = {
      episode_run_time: [47],
      origin_country: ["US"],
      created_by: [{ name: "Vince Gilligan" }],
    };

    globalThis.fetch = mock((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      let body: unknown = tmdbMultiResponse;
      if (url.includes("/movie/550")) body = movieDetail;
      else if (url.includes("/tv/1396")) body = tvDetail;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof fetch;

    const res = await app.request("/api/search?q=fight");
    expect(res.status).toBe(200);

    const body = (await res.json()) as Array<Record<string, unknown>>;
    // Should filter out "person" type
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      id: 550,
      mediaType: "movie",
      title: "Fight Club",
      originalTitle: null,
      originalLanguage: "en",
      posterPath: "/poster550.jpg",
      year: "1999",
      overview: "An insomniac office worker...",
      country: "US",
      director: "David Fincher",
      duration: "2h19",
    });
    expect(body[1]).toEqual({
      id: 1396,
      mediaType: "tv",
      title: "Breaking Bad",
      originalTitle: null,
      originalLanguage: "en",
      posterPath: "/poster1396.jpg",
      year: "2008",
      overview: "A high school chemistry teacher...",
      country: "US",
      director: "Vince Gilligan",
      duration: "47min",
    });
  });

  it("uses TMDB API key in request URL", async () => {
    process.env.TMDB_API_KEY = "my-secret-key";

    const mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ results: [] }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    await app.request("/api/search?q=matrix");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("api_key=my-secret-key");
    expect(calledUrl).toContain("query=matrix");
  });

  it("throws when TMDB_API_KEY is not set", async () => {
    delete process.env.TMDB_API_KEY;

    const res = await app.request("/api/search?q=fight");
    expect(res.status).toBe(500);
  });
});

describe("GET /api/search/details/:type/:id", () => {
  it("returns 400 for invalid media type", async () => {
    const res = await app.request("/api/search/details/person/123");
    expect(res.status).toBe(400);
  });

  it("returns TMDB details for a movie", async () => {
    process.env.TMDB_API_KEY = "test-key";

    const details = { id: 550, title: "Fight Club", runtime: 139 };
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(details), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ) as typeof fetch;

    const res = await app.request("/api/search/details/movie/550");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(details);
  });

  it("returns TMDB details for a TV show", async () => {
    process.env.TMDB_API_KEY = "test-key";

    const details = { id: 1396, name: "Breaking Bad", number_of_seasons: 5 };
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(details), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ) as typeof fetch;

    const res = await app.request("/api/search/details/tv/1396");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(details);
  });

  it("returns 404 when TMDB returns error", async () => {
    process.env.TMDB_API_KEY = "test-key";

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 404 })),
    ) as typeof fetch;

    const res = await app.request("/api/search/details/movie/0");
    expect(res.status).toBe(404);
  });
});
