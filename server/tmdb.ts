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
  original_title?: string;
  original_name?: string;
  original_language?: string;
  origin_country?: string[];
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  popularity?: number;
  known_for?: TmdbMultiResult[];
}

interface TmdbDetailResult {
  runtime?: number | null;
  episode_run_time?: number[];
  origin_country?: string[];
  credits?: { crew: { job: string; name: string }[] };
  created_by?: { name: string }[];
}

export async function searchMulti(
  query: string,
): Promise<TmdbSearchResult[]> {
  const url = `${BASE}/search/multi?api_key=${apiKey()}&query=${encodeURIComponent(query)}&include_adult=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as { results: TmdbMultiResult[] };

  // Collect movie/tv results directly, plus known_for items from person results
  const pool: TmdbMultiResult[] = [];
  const seen = new Set<number>();
  for (const r of data.results) {
    if (r.media_type === "movie" || r.media_type === "tv") {
      if (!seen.has(r.id)) { seen.add(r.id); pool.push(r); }
    } else if (r.media_type === "person" && r.known_for) {
      for (const k of r.known_for) {
        if ((k.media_type === "movie" || k.media_type === "tv") && !seen.has(k.id)) {
          seen.add(k.id); pool.push(k);
        }
      }
    }
  }
  const top = pool
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, 8);

  const details = await Promise.all(
    top.map((r) => fetchDetail(r.id, r.media_type as MediaType)),
  );

  return top.map((r, i) => {
    const title = r.title || r.name || "Unknown";
    const originalTitle = r.original_title || r.original_name || null;
    const lang = r.original_language || "en";
    const d = details[i];
    return {
      id: r.id,
      mediaType: r.media_type as MediaType,
      title,
      originalTitle: originalTitle !== title ? originalTitle : null,
      originalLanguage: lang,
      posterPath: r.poster_path,
      year: extractYear(r.release_date || r.first_air_date),
      overview: r.overview || "",
      country: r.origin_country?.[0] ?? d?.origin_country?.[0] ?? null,
      director: extractDirector(r.media_type as MediaType, d),
      duration: formatDuration(r.media_type as MediaType, d),
    };
  });
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

async function fetchDetail(
  id: number,
  mediaType: MediaType,
): Promise<TmdbDetailResult | null> {
  try {
    const url = `${BASE}/${mediaType}/${id}?api_key=${apiKey()}&append_to_response=credits`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as TmdbDetailResult;
  } catch {
    return null;
  }
}

function extractDirector(
  mediaType: MediaType,
  detail: TmdbDetailResult | null,
): string | null {
  if (!detail) return null;
  if (mediaType === "movie") {
    return detail.credits?.crew.find((c) => c.job === "Director")?.name ?? null;
  }
  return detail.created_by?.[0]?.name ?? null;
}

function formatDuration(
  mediaType: MediaType,
  detail: TmdbDetailResult | null,
): string | null {
  if (!detail) return null;
  const minutes =
    mediaType === "movie"
      ? detail.runtime
      : detail.episode_run_time?.[0];
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function extractYear(date?: string): string | null {
  if (!date) return null;
  return date.slice(0, 4);
}
