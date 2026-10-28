CREATE TABLE `billing_play_orders` (
	`order_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`mode` text NOT NULL,
	`purchase_option_id` text NOT NULL,
	`allow_test` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `billing_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `billing_play_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`token_encrypted` text NOT NULL,
	`verified_at` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `billing_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_billing_play_order` ON `billing_play_tokens` (`order_id`);