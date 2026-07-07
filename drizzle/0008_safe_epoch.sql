ALTER TABLE "team_curses" DROP CONSTRAINT "team_curses_user_id_team_id_pk";--> statement-breakpoint
ALTER TABLE "team_curses" ADD COLUMN "id" serial PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "team_curses" ADD COLUMN "scores_from" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "team_curses" ADD COLUMN "lifted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_curses_active_idx" ON "team_curses" USING btree ("user_id","team_id") WHERE "team_curses"."lifted_at" is null;--> statement-breakpoint
-- Grandfather every curse that predates state-at-kickoff scoring: the old
-- board paid retroactively, so pre-existing curses keep scoring from the
-- beginning of time rather than their cast date.
UPDATE "team_curses" SET "scores_from" = 'epoch';--> statement-breakpoint
-- Rebuild lifted-curse history from the audit log ("curse.lift" events had
-- their team_curses rows hard-deleted). Backfilled rows are grandfathered the
-- same way (scores_from = epoch, paying until the lift), and created_at is
-- set to the epoch so they sink to the bottom of the activity feed instead of
-- appearing as fresh casts.
INSERT INTO "team_curses" ("user_id", "team_id", "curse_text", "scores_from", "lifted_at", "created_at")
SELECT ae."user_id",
       (regexp_match(ae."detail", 'team_id=(\d+)'))[1]::int,
       NULL,
       'epoch',
       ae."created_at",
       'epoch'
FROM "audit_events" ae
JOIN "teams" t ON t."id" = (regexp_match(ae."detail", 'team_id=(\d+)'))[1]::int
WHERE ae."kind" = 'curse.lift'
  AND ae."user_id" IS NOT NULL
  AND ae."detail" ~ 'team_id=\d+';