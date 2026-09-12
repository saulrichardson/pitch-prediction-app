CREATE TABLE "replay_records" (
	"key" text PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" integer
);
