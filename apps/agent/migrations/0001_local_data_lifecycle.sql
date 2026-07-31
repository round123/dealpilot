ALTER TABLE `reminders` ADD `pause_reason` text;
--> statement-breakpoint
ALTER TABLE `reminders` ADD `reevaluate_at` text;
--> statement-breakpoint
UPDATE `settings` SET `backup_reminder_days` = 7 WHERE `backup_reminder_days` IS NULL;
