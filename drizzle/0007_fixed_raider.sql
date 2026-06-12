ALTER TABLE "audit_events" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "score_edits" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_name" text;--> statement-breakpoint
ALTER TABLE "score_edits" ADD COLUMN "editor_name" text;