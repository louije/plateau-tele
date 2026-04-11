ALTER TABLE `watch_items` ADD `watched_at` text;--> statement-breakpoint
UPDATE `watch_items` SET `watched_at` = `updated_at` WHERE `watched` = 1;