import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { createApp } from "../app.js";
import { createTestDb } from "../test-utils.js";
import type { DbInstance } from "../app.js";

let db: DbInstance;
let close: () => void;
let app: ReturnType<typeof createApp>;
let originalFetch: typeof globalThis.fetch;

const movieData = {
  id: 550,
  title: "Fight Club",
  original_title: "Fight Club",
  original_language: "en",
  overview: "An insomniac office worker...",
  poster_path: "/poster550.jpg",
  release_date: "1999-10-15",
  runtime: 139,
  origin_country: ["US"],
  credits: {
    crew: [{ job: "Director", name: "David Fincher" }],
    cast: [
      { name: "Brad Pitt", character: "Tyler Durden", profile_path: "/brad.jpg", order: 0 },
    ],
  },
  "watch/providers": {
    results: {
      FR: {
        flatrate: [
          { provider_name: "Disney Plus", logo_path: "/disney.jpg" },
        ],
        buy: [
          { provider_name: "Apple TV", logo_path: "/apple.jpg" },
        ],
      },
    },
  },
};

const tvData = {
  id: 1396,
  name: "Breaking Bad",
  original_name: "Breaking Bad",
  original_language: "en",
  overview: "A high school chemistry teacher...",
  poster_path: "/poster1396.jpg",
  first_air_date: "2008-01-20",
  episode_run_time: [47],
  origin_country: ["US"],
  created_by: [{ name: "Vince Gilligan" }],
  credits: {
    cast: [
      { name: "Bryan Cranston", character: "Walter White", profile_path: "/bryan.jpg", order: 0 },
    ],
  },
  "watch/providers": {},
};

const jellyseerrAvailable = { mediaInfo: { status: 5 } };
const jellyseerrRequested = { mediaInfo: { status: 2 } };
const jellyseerrUnavailable = {};

function mockTmdb(jellyseerrData: Record<string, unknown> = jellyseerrUnavailable) {
  globalThis.fetch = mock((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("jellyseerr")) {
      return Promise.resolve(
        new Response(JSON.stringify(jellyseerrData), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/movie/550")) {
      return Promise.resolve(
        new Response(JSON.stringify(movieData), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/tv/1396")) {
      return Promise.resolve(
        new Response(JSON.stringify(tvData), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  }) as typeof fetch;
}

beforeEach(() => {
  ({ db, close } = createTestDb());
  app = createApp(db);
  originalFetch = globalThis.fetch;
  process.env.TMDB_API_KEY = "test-key";
  process.env.LOCALE = "fr";
  process.env.JELLYSEERR_URL = "http://jellyseerr:5055";
  process.env.JELLYSEERR_API_KEY = "test-api-key";
  delete process.env.USERS;
});

afterEach(() => {
  close();
  globalThis.fetch = originalFetch;
  delete process.env.USERS;
  delete process.env.JELLYSEERR_URL;
  delete process.env.JELLYSEERR_API_KEY;
});

describe("GET /detail/:type/:id", () => {
  it("renders a movie detail page", async () => {
    mockTmdb();
    const res = await app.request("/detail/movie/550");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("Fight Club");
    expect(html).toContain("David Fincher");
    expect(html).toContain("Brad Pitt");
    expect(html).toContain("Ajouter à la liste");
  });

  it("renders a TV show detail page", async () => {
    mockTmdb();
    const res = await app.request("/detail/tv/1396");
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("Breaking Bad");
    expect(html).toContain("Vince Gilligan");
    expect(html).toContain("Bryan Cranston");
  });

  it("returns 404 for invalid media type", async () => {
    const res = await app.request("/detail/person/123");
    expect(res.status).toBe(404);
  });

  it("returns 404 for NaN id", async () => {
    const res = await app.request("/detail/movie/abc");
    expect(res.status).toBe(404);
  });

  it("returns 404 when TMDB has no data", async () => {
    mockTmdb();
    const res = await app.request("/detail/movie/9999");
    expect(res.status).toBe(404);
  });

  it("shows mark-watched button when item exists in list", async () => {
    mockTmdb();
    await app.request("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId: 550,
        mediaType: "movie",
        title: "Fight Club",
        originalTitle: null,
        originalLanguage: "en",
        posterPath: "/poster550.jpg",
        year: "1999",
        note: "Great",
        addedBy: "Alice",
      }),
    });

    const res = await app.request("/detail/movie/550");
    const html = await res.text();
    expect(html).toContain("Marquer comme regardé");
    expect(html).toContain("Retirer de la liste");
    expect(html).not.toContain("Ajouter à la liste");
  });

  it("shows already-watched status when item is watched", async () => {
    mockTmdb();
    const createRes = await app.request("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId: 550,
        mediaType: "movie",
        title: "Fight Club",
        originalTitle: null,
        originalLanguage: "en",
        posterPath: "/poster550.jpg",
        year: "1999",
        note: "Great",
        addedBy: "Alice",
      }),
    });
    const created = (await createRes.json()) as { id: number };
    await app.request(`/api/items/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watched: true }),
    });

    const res = await app.request("/detail/movie/550");
    const html = await res.text();
    expect(html).toContain("Déjà regardé");
  });

  it("uses LOCALE env for language", async () => {
    mockTmdb();
    process.env.LOCALE = "en";
    const res = await app.request("/detail/movie/550");
    const html = await res.text();
    expect(html).toContain("Add to list");
  });

  it("threads search query into back link and add URL", async () => {
    mockTmdb();
    const res = await app.request("/detail/movie/550?q=fight");
    const html = await res.text();
    expect(html).toContain("?q=fight");
  });

  it("shows available badge when Jellyfin has the media", async () => {
    mockTmdb(jellyseerrAvailable);
    const res = await app.request("/detail/movie/550");
    const html = await res.text();
    expect(html).toContain("availability--available");
    expect(html).toContain("Disponible sur Jellyfin");
    expect(html).not.toContain("btn-request");
  });

  it("shows requested status when already requested", async () => {
    mockTmdb(jellyseerrRequested);
    const res = await app.request("/detail/movie/550");
    const html = await res.text();
    expect(html).toContain("availability--requested");
    expect(html).toContain("Téléchargement demandé");
    expect(html).not.toContain("btn-request");
  });

  it("shows request button when not available", async () => {
    mockTmdb(jellyseerrUnavailable);
    const res = await app.request("/detail/movie/550");
    const html = await res.text();
    expect(html).toContain("btn-request");
    expect(html).toContain("Demander le téléchargement");
  });

  it("renders FR watch providers", async () => {
    mockTmdb();
    const res = await app.request("/detail/movie/550");
    const html = await res.text();
    expect(html).toContain("Où regarder");
    expect(html).toContain("Disney Plus");
    expect(html).toContain("Apple TV");
    expect(html).toContain("provider__logo");
  });

  it("does not render watch providers section when FR has none", async () => {
    mockTmdb();
    const res = await app.request("/detail/tv/1396");
    const html = await res.text();
    expect(html).not.toContain("watch-providers");
  });

  it("shows request button text in English", async () => {
    mockTmdb(jellyseerrUnavailable);
    process.env.LOCALE = "en";
    const res = await app.request("/detail/movie/550");
    const html = await res.text();
    expect(html).toContain("Request download");
  });

  it("degrades gracefully when Jellyseerr is not configured", async () => {
    delete process.env.JELLYSEERR_URL;
    delete process.env.JELLYSEERR_API_KEY;
    mockTmdb();
    const res = await app.request("/detail/movie/550");
    expect(res.status).toBe(200);
    const html = await res.text();
    // Should show request button (unavailable status)
    expect(html).toContain("btn-request");
  });
});

describe("GET /detail/:type/:id/add", () => {
  it("renders text input when USERS is empty", async () => {
    mockTmdb();
    const res = await app.request("/detail/movie/550/add");
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("Fight Club");
    expect(html).toContain('type="text"');
    expect(html).toContain('name="addedBy"');
    expect(html).not.toContain("toggle-group");
  });

  it("renders user toggle when USERS is set", async () => {
    mockTmdb();
    process.env.USERS = "Cathy,LJ";
    const res = await app.request("/detail/movie/550/add");
    const html = await res.text();
    expect(html).toContain("toggle-group");
    expect(html).toContain('value="Cathy"');
    expect(html).toContain('value="LJ"');
    expect(html).not.toContain('type="text"');
  });

  it("returns 404 for invalid media type", async () => {
    const res = await app.request("/detail/person/123/add");
    expect(res.status).toBe(404);
  });

  it("returns 404 when TMDB has no data", async () => {
    mockTmdb();
    const res = await app.request("/detail/movie/9999/add");
    expect(res.status).toBe(404);
  });

  it("uses LOCALE env for add modal language", async () => {
    mockTmdb();
    process.env.LOCALE = "en";
    const res = await app.request("/detail/movie/550/add");
    const html = await res.text();
    expect(html).toContain("Added by");
    expect(html).toContain("Why are we watching this");
  });
});
