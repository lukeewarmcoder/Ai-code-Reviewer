CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`client_ip` text NOT NULL,
	`code_hash` text NOT NULL,
	`code_length` integer NOT NULL,
	`language` text,
	`status` text NOT NULL,
	`error_code` text,
	`result` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usage_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_ip` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL
);
