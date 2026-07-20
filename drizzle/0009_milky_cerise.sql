CREATE TABLE IF NOT EXISTS "payout_votes" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"choice" text NOT NULL,
	"voted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payout_votes" ADD CONSTRAINT "payout_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
