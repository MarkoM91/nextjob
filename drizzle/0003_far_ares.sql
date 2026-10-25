CREATE TABLE `alert_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`email_revision` integer NOT NULL,
	`payload_encrypted` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`lease_until` integer,
	`lease_token` text,
	`provider_id` text,
	`failure_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_alert_delivery_due` ON `alert_deliveries` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_alert_delivery_owner` ON `alert_deliveries` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `alert_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`job_id` text NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`location` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	`email_batch` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_alert_inbox_job` ON `alert_inbox` (`owner_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `idx_alert_inbox_owner` ON `alert_inbox` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `alert_runtime` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_until` integer NOT NULL,
	`lease_token` text NOT NULL,
	`last_run` integer
);
--> statement-breakpoint
CREATE TABLE `alert_seen` (
	`owner_id` text NOT NULL,
	`job_id` text NOT NULL,
	`seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_alert_seen_job` ON `alert_seen` (`owner_id`,`job_id`);--> statement-breakpoint
CREATE TABLE `alert_settings` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`in_app` integer DEFAULT 0 NOT NULL,
	`email_enabled` integer DEFAULT 0 NOT NULL,
	`email_encrypted` text,
	`email_hash` text,
	`email_revision` integer DEFAULT 0 NOT NULL,
	`verified_at` integer,
	`verification_hash` text,
	`verification_expires` integer,
	`verification_requested` integer,
	`verification_day` text,
	`verification_count` integer DEFAULT 0 NOT NULL,
	`config_json` text NOT NULL,
	`baseline_revision` text,
	`next_check` integer NOT NULL,
	`check_lease` text,
	`lease_until` integer,
	`last_checked` integer,
	`last_error` text,
	`next_email` integer NOT NULL,
	`consented_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_alert_due` ON `alert_settings` (`next_check`);