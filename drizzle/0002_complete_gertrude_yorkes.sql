CREATE TABLE IF NOT EXISTS "profile_jabs" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_user_id" integer NOT NULL,
	"author_user_id" integer NOT NULL,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_jabs" ADD CONSTRAINT "profile_jabs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_jabs" ADD CONSTRAINT "profile_jabs_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_jabs_target_idx" ON "profile_jabs" USING btree ("target_user_id","created_at");