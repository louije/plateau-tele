ALTER TABLE `watch_items` ADD `original_title` text;--> statement-breakpoint
ALTER TABLE `watch_items` ADD `original_language` text DEFAULT 'en' NOT NULL;