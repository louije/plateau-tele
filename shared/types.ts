export type MediaType = "movie" | "tv";

export interface WatchItem {
  id: number;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  year: string | null;
  note: string;
  addedBy: string;
  position: number;
  watched: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TmdbSearchResult {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  year: string | null;
  overview: string;
}

export interface WatchItemCreate {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  year: string | null;
  note: string;
  addedBy: string;
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
