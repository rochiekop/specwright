CREATE TABLE `chat_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`message_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`kind` text NOT NULL,
	`op` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`applied_version` integer,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
