import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const watchItems = sqliteTable("watch_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type", { enum: ["movie", "tv"] }).notNull(),
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  originalLanguage: text("original_language").notNull().default("en"),
  posterPath: text("poster_path"),
  year: text("year"),
  note: text("note").notNull().default(""),
  addedBy: text("added_by").notNull(),
  director: text("director"),
  country: text("country"),
  duration: text("duration"),
  position: real("position").notNull(),
  watched: integer("watched", { mode: "boolean" }).notNull().default(false),
  watchedAt: text("watched_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
