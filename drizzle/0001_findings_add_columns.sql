ALTER TABLE `quality_findings` ADD `source` text DEFAULT 'rule' NOT NULL;--> statement-breakpoint
ALTER TABLE `quality_findings` ADD `prd_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `quality_findings` ADD `section` integer;--> statement-breakpoint
ALTER TABLE `quality_findings` ADD `suggestion` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `quality_findings` ADD `status` text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE `quality_findings` ADD `fixed_in_version` integer;