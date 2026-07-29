CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`email` text,
	`phone` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`company` text,
	`country` text,
	`source` text,
	`grade` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `follow_ups` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`project_id` text,
	`type` text NOT NULL,
	`note` text,
	`message_body` text,
	`message_direction` text,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`valid_rows` integer DEFAULT 0 NOT NULL,
	`failed_rows` integer DEFAULT 0 NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'parsing' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`metadata` text,
	`occurred_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`amount` real,
	`probability` integer,
	`expected_close_date` text,
	`stage` text NOT NULL,
	`grade` text NOT NULL,
	`closed_reason` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`project_id` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`due_at` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`last_notified_at` text,
	`snooze_until` text,
	`resolution` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `risks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`description` text NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`handled_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`last_backup_at` text,
	`auto_start` integer DEFAULT false NOT NULL,
	`minimize_to_tray` integer DEFAULT true NOT NULL,
	`backup_reminder_days` integer,
	`locale` text DEFAULT 'zh-CN' NOT NULL,
	`theme` text DEFAULT 'light' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `social_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`contact_id` text,
	`platform` text NOT NULL,
	`raw_identifier` text NOT NULL,
	`normalized_identifier` text NOT NULL,
	`manually_bound` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_contacts_customer_id` ON `contacts` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_contacts_email` ON `contacts` (`email`);--> statement-breakpoint
CREATE INDEX `idx_contacts_phone` ON `contacts` (`phone`);--> statement-breakpoint
CREATE INDEX `idx_customers_grade` ON `customers` (`grade`);--> statement-breakpoint
CREATE INDEX `idx_customers_status` ON `customers` (`status`);--> statement-breakpoint
CREATE INDEX `idx_customers_deleted_at` ON `customers` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_follow_ups_customer_id` ON `follow_ups` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_follow_ups_project_id` ON `follow_ups` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_follow_ups_occurred_at` ON `follow_ups` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_import_jobs_status` ON `import_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_import_jobs_created_at` ON `import_jobs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_local_events_event_type` ON `local_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_local_events_occurred_at` ON `local_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_milestones_project_id` ON `milestones` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_milestones_date` ON `milestones` (`date`);--> statement-breakpoint
CREATE INDEX `idx_milestones_completed` ON `milestones` (`completed`);--> statement-breakpoint
CREATE INDEX `idx_projects_customer_id` ON `projects` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_projects_stage` ON `projects` (`stage`);--> statement-breakpoint
CREATE INDEX `idx_projects_grade` ON `projects` (`grade`);--> statement-breakpoint
CREATE INDEX `idx_reminders_status` ON `reminders` (`status`);--> statement-breakpoint
CREATE INDEX `idx_reminders_due_at` ON `reminders` (`due_at`);--> statement-breakpoint
CREATE INDEX `idx_reminders_customer_id` ON `reminders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_reminders_project_id` ON `reminders` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_reminders_priority` ON `reminders` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_risks_project_id` ON `risks` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_risks_status` ON `risks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_risks_severity` ON `risks` (`severity`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_social_accounts_platform_normalized` ON `social_accounts` (`platform`,`normalized_identifier`);--> statement-breakpoint
CREATE INDEX `idx_social_accounts_customer_id` ON `social_accounts` (`customer_id`);