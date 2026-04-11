export type MediaType = "movie" | "tv";

export interface WatchItem {
  id: number;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  originalTitle: string | null;
  originalLanguage: string;
  posterPath: string | null;
  year: string | null;
  note: string;
  addedBy: string;
  director: string | null;
  country: string | null;
  duration: string | null;
  position: number;
  watched: boolean;
  watchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TmdbSearchResult {
  id: number;
  mediaType: MediaType;
  title: string;
  originalTitle: string | null;
  originalLanguage: string;
  posterPath: string | null;
  year: string | null;
  overview: string;
  country: string | null;
  director: string | null;
  duration: string | null;
}

export interface WatchItemCreate {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  originalTitle: string | null;
  originalLanguage: string;
  posterPath: string | null;
  year: string | null;
  note: string;
  addedBy: string;
  director: string | null;
  country: string | null;
  duration: string | null;
}

export interface ReorderPayload {
  itemId: number;
  newPosition: number;
}

export type SSEEvent =
  | { type: "item:added"; item: WatchItem }
  | { type: "item:removed"; itemId: number }
  | { type: "item:updated"; item: WatchItem }
  | { type: "item:reordered"; items: Pick<WatchItem, "id" | "position">[] }
  | { type: "item:watched"; item: WatchItem };
