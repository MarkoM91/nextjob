CREATE TABLE `billing_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`customer_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_billing_customer_owner` ON `billing_customers` (`owner_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_billing_customer_provider` ON `billing_customers` (`provider`,`customer_id`);--> statement-breakpoint
CREATE TABLE `billing_cv_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`version_id` text NOT NULL,
	`job_id` text NOT NULL,
	`object_prefix` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_billing_cv_owner_version` ON `billing_cv_versions` (`owner_id`,`version_id`);--> statement-breakpoint
CREATE TABLE `billing_entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`cv_version_id` text NOT NULL,
	`order_id` text NOT NULL,
	`granted_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `billing_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_billing_entitlement_order` ON `billing_entitlements` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_billing_entitlements_access` ON `billing_entitlements` (`owner_id`,`cv_version_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_id` text NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_billing_event_provider` ON `billing_events` (`provider`,`event_id`);--> statement-breakpoint
CREATE TABLE `billing_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`cv_version_id` text,
	`job_id` text,
	`model` text NOT NULL,
	`product_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_checkout_id` text,
	`provider_payment_id` text,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`redownload_days` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`paid_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_billing_order_checkout` ON `billing_orders` (`provider`,`provider_checkout_id`);--> statement-breakpoint
CREATE INDEX `idx_billing_orders_owner_version` ON `billing_orders` (`owner_id`,`cv_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_billing_pending_order` ON `billing_orders` (`owner_id`,`cv_version_id`,`model`) WHERE status = 'pending';--> statement-breakpoint
CREATE TABLE `billing_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_subscription_id` text NOT NULL,
	`product_id` text NOT NULL,
	`price_id` text NOT NULL,
	`status` text NOT NULL,
	`period_ends_at` integer NOT NULL,
	`cancel_at_period_end` integer DEFAULT 0 NOT NULL,
	`provider_updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_billing_subscription_provider` ON `billing_subscriptions` (`provider`,`provider_subscription_id`);--> statement-breakpoint
CREATE INDEX `idx_billing_subscription_owner` ON `billing_subscriptions` (`owner_id`,`period_ends_at`);