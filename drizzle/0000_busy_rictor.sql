CREATE TABLE `bug_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`received_at` text NOT NULL,
	`session_id` text NOT NULL,
	`build_id` text NOT NULL,
	`area` text NOT NULL,
	`tile` text NOT NULL,
	`world_x` real NOT NULL,
	`world_y` real NOT NULL,
	`world_z` real NOT NULL,
	`game_latitude` real NOT NULL,
	`game_longitude` real NOT NULL,
	`road_id` text,
	`road_name` text,
	`observations` text NOT NULL,
	`context_json` text NOT NULL,
	`game_screenshot_jpeg` text
);
--> statement-breakpoint
CREATE INDEX `bug_reports_received` ON `bug_reports` (`received_at`);--> statement-breakpoint
CREATE INDEX `bug_reports_session_received` ON `bug_reports` (`session_id`,`received_at`);