CREATE TABLE IF NOT EXISTS "nickname_votes" (
	"nickname" text NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nickname_votes_nickname_user_id_pk" PRIMARY KEY("nickname","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nickname_votes" ADD CONSTRAINT "nickname_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
