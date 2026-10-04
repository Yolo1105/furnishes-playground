CREATE TABLE "share" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_user_id_idx" ON "share" USING btree ("user_id");