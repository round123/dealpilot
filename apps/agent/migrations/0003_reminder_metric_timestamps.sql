ALTER TABLE `reminders` ADD `delivered_at` text;
--> statement-breakpoint
ALTER TABLE `reminders` ADD `handled_at` text;
--> statement-breakpoint
UPDATE `reminders`
SET `delivered_at` = `last_notified_at`
WHERE `last_notified_at` IS NOT NULL;
