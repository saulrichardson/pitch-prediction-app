CREATE TABLE "timeline_start_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"game_pk" text NOT NULL,
	"status" text NOT NULL,
	"timeline_id" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "timeline_start_jobs_workspace_idx" ON "timeline_start_jobs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "timeline_start_jobs_status_idx" ON "timeline_start_jobs" USING btree ("status");