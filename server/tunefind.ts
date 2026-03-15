/**
 * Tunefind client using the undocumented frontend API.
 * https://www.tunefind.com/api/frontend/
 */

export interface TunefindSong {
  name: string;
  artists: string;
}

export interface TunefindMovieResult {
  type: "movie";
  slug: string;
  songs: TunefindSong[];
}

export interface TunefindShowResult {
  type: "tv";
  slug: string;
  seasonCount: number;
}

export type TunefindResult = TunefindMovieResult | TunefindShowResult;

const API = "https://www.tunefind.com/api/frontend";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const cache = new Map<string, { data: TunefindResult | null; ts: number }>();

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/['\u2018\u2019\u02bc]/g, "") // strip apostrophes
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchTunefind(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://www.tunefind.com/",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function tryFetch(
  slug: string,
  mediaType: "movie" | "tv",
): Promise<Record<string, unknown> | null> {
  const path = mediaType === "movie" ? "movie" : "show";
  const fields = mediaType === "movie" ? "song-events" : "seasons";
  return fetchTunefind(`${API}/${path}/${slug}?fields=${fields}`);
}

export async function getTunefindData(
  title: string,
  mediaType: "movie" | "tv",
  year?: string | null,
): Promise<TunefindResult | null> {
  const cacheKey = `${mediaType}:${title}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const slug = slugify(title);
  let data = await tryFetch(slug, mediaType);

  // Some entries use a year suffix for disambiguation (e.g. "the-office-2005")
  if (!data && year) {
    data = await tryFetch(`${slug}-${year}`, mediaType);
  }

  let result: TunefindResult | null = null;

  if (data) {
    if (mediaType === "movie") {
      type SongEvent = { song: { name: string; artists: { name: string }[] } };
      const songEvents = (data.song_events as SongEvent[]) ?? [];
      const songs: TunefindSong[] = songEvents.map((se) => ({
        name: se.song.name,
        artists: se.song.artists.map((a) => a.name).join(", "),
      }));
      result = { type: "movie", slug, songs };
    } else {
      const seasons = (data.seasons as unknown[]) ?? [];
      result = { type: "tv", slug, seasonCount: seasons.length };
    }
  }

  cache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}
