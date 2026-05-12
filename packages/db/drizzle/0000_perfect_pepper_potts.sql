CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"timeline_id" text,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "branch_pitch_events" (
	"id" text PRIMARY KEY NOT NULL,
	"timeline_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "games" (
	"game_pk" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"official_date" text NOT NULL,
	"away_team" text NOT NULL,
	"home_team" text NOT NULL,
	"away_score" integer DEFAULT 0 NOT NULL,
	"home_score" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "manual_situations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pitch_events" (
	"id" text PRIMARY KEY NOT NULL,
	"game_pk" text,
	"pa_id" text,
	"game_pitch_index" integer NOT NULL,
	"source" text NOT NULL,
	"pitch_type" text NOT NULL,
	"result" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plate_appearances" (
	"id" text PRIMARY KEY NOT NULL,
	"game_pk" text,
	"inning" integer NOT NULL,
	"half" text NOT NULL,
	"pitcher_id" text,
	"batter_id" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"player_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"handedness" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prediction_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"timeline_id" text NOT NULL,
	"pitch_moment" integer NOT NULL,
	"model_version" text NOT NULL,
	"request" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "timelines" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"mode" text NOT NULL,
	"game_pk" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
DECLARE
	source_attnum smallint;
	target_attnum smallint;
BEGIN
	SELECT attnum INTO source_attnum FROM pg_attribute WHERE attrelid = 'public.pitch_events'::regclass AND attname = 'game_pk' AND NOT attisdropped;
	SELECT attnum INTO target_attnum FROM pg_attribute WHERE attrelid = 'public.games'::regclass AND attname = 'game_pk' AND NOT attisdropped;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conrelid = 'public.pitch_events'::regclass
			AND confrelid = 'public.games'::regclass
			AND contype = 'f'
			AND conkey = ARRAY[source_attnum]::smallint[]
			AND confkey = ARRAY[target_attnum]::smallint[]
	) THEN
		ALTER TABLE "pitch_events" ADD CONSTRAINT "pitch_events_game_pk_games_game_pk_fk" FOREIGN KEY ("game_pk") REFERENCES "public"."games"("game_pk") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$
DECLARE
	source_attnum smallint;
	target_attnum smallint;
BEGIN
	SELECT attnum INTO source_attnum FROM pg_attribute WHERE attrelid = 'public.pitch_events'::regclass AND attname = 'pa_id' AND NOT attisdropped;
	SELECT attnum INTO target_attnum FROM pg_attribute WHERE attrelid = 'public.plate_appearances'::regclass AND attname = 'id' AND NOT attisdropped;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conrelid = 'public.pitch_events'::regclass
			AND confrelid = 'public.plate_appearances'::regclass
			AND contype = 'f'
			AND conkey = ARRAY[source_attnum]::smallint[]
			AND confkey = ARRAY[target_attnum]::smallint[]
	) THEN
		ALTER TABLE "pitch_events" ADD CONSTRAINT "pitch_events_pa_id_plate_appearances_id_fk" FOREIGN KEY ("pa_id") REFERENCES "public"."plate_appearances"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$
DECLARE
	source_attnum smallint;
	target_attnum smallint;
BEGIN
	SELECT attnum INTO source_attnum FROM pg_attribute WHERE attrelid = 'public.plate_appearances'::regclass AND attname = 'game_pk' AND NOT attisdropped;
	SELECT attnum INTO target_attnum FROM pg_attribute WHERE attrelid = 'public.games'::regclass AND attname = 'game_pk' AND NOT attisdropped;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conrelid = 'public.plate_appearances'::regclass
			AND confrelid = 'public.games'::regclass
			AND contype = 'f'
			AND conkey = ARRAY[source_attnum]::smallint[]
			AND confkey = ARRAY[target_attnum]::smallint[]
	) THEN
		ALTER TABLE "plate_appearances" ADD CONSTRAINT "plate_appearances_game_pk_games_game_pk_fk" FOREIGN KEY ("game_pk") REFERENCES "public"."games"("game_pk") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_timeline_idx" ON "audit_events" USING btree ("timeline_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branch_pitch_events_branch_idx" ON "branch_pitch_events" USING btree ("timeline_id","branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_official_date_idx" ON "games" USING btree ("official_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_situations_workspace_idx" ON "manual_situations" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pitch_events_game_pitch_idx" ON "pitch_events" USING btree ("game_pk","game_pitch_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pitch_events_pa_idx" ON "pitch_events" USING btree ("pa_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_name_idx" ON "players" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_runs_timeline_idx" ON "prediction_runs" USING btree ("timeline_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timelines_workspace_idx" ON "timelines" USING btree ("workspace_id");
