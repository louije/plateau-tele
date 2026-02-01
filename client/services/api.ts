import type {
  WatchItem,
  WatchItemCreate,
  TmdbSearchResult,
  ReorderPayload,
} from "../../shared/types.js";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function fetchItems(watched = false): Promise<WatchItem[]> {
  return request(`/items?watched=${watched}`);
}

export function addItem(item: WatchItemCreate): Promise<WatchItem> {
  return request("/items", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export function updateItem(
  id: number,
  data: Partial<Pick<WatchItem, "note" | "watched">>,
): Promise<WatchItem> {
  return request(`/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function removeItem(id: number): Promise<void> {
  return request(`/items/${id}`, { method: "DELETE" });
}

export function reorderItems(payload: ReorderPayload[]): Promise<void> {
  return request("/items/reorder", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function searchTmdb(query: string): Promise<TmdbSearchResult[]> {
  return request(`/search?q=${encodeURIComponent(query)}`);
}

export interface JellyfinStatus {
  tmdbId: number;
  mediaType: string;
  status: "available" | "requested" | "processing" | "unavailable";
}

export function fetchJellyfinStatuses(
  items: { tmdbId: number; mediaType: string }[],
): Promise<JellyfinStatus[]> {
  return request("/jellyseerr/batch-status", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}
