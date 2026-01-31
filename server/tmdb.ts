import type { TmdbSearchResult, MediaType } from "../shared/types.js";

const BASE = "https://api.themoviedb.org/3";

function apiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY not set");
  return key;
}

interface TmdbMultiResult {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
}

export async function searchMulti(
  query: string,
): Promise<TmdbSearchResult[]> {
  const url = `${BASE}/search/multi?api_key=${apiKey()}&query=${encodeURIComponent(query)}&include_adult=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as { results: TmdbMultiResult[] };

  return data.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      mediaType: r.media_type as MediaType,
      title: r.title || r.name || "Unknown",
      posterPath: r.poster_path,
      year: extractYear(r.release_date || r.first_air_date),
      overview: r.overview || "",
    }));
}

export async function getDetails(
  tmdbId: number,
  mediaType: MediaType,
): Promise<Record<string, unknown> | null> {
  const url = `${BASE}/${mediaType}/${tmdbId}?api_key=${apiKey()}&append_to_response=watch/providers,credits`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

function extractYear(date?: string): string | null {
  if (!date) return null;
  return date.slice(0, 4);
}
