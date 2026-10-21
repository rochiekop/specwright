CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`kind` text DEFAULT 'prd' NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`reason` text DEFAULT 'generate' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `features` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`spec` text DEFAULT '' NOT NULL,
	`icon` text DEFAULT 'box' NOT NULL,
	`phase` integer DEFAULT 1 NOT NULL,
	`priority` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`source` text DEFAULT 'ai' NOT NULL,
	`is_draft` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `generation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text,
	`step` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt` text NOT NULL,
	`response` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`duration_ms` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`idea` text NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`stack_preset_id` text,
	`tech_stack` text NOT NULL,
	`questions` text DEFAULT '[]' NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`current_step` text DEFAULT 'idea' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stack_preset_id`) REFERENCES `stack_presets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quality_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`rule` text NOT NULL,
	`severity` text NOT NULL,
	`target_ref` text DEFAULT '' NOT NULL,
	`message` text NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stack_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tech_stack` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`feature_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`acceptance` text DEFAULT '' NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`layer` text NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`depends_on` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'ai' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`feature_id`) REFERENCES `features`(`id`) ON UPDATE no action ON DELETE cascade
);
