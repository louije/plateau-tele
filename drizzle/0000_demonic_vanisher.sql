CREATE TABLE `watch_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tmdb_id` integer NOT NULL,
	`media_type` text NOT NULL,
	`title` text NOT NULL,
	`poster_path` text,
	`year` text,
	`note` text DEFAULT '' NOT NULL,
	`added_by` text NOT NULL,
	`position` real NOT NULL,
	`watched` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
