CREATE TABLE "sync" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"at" bigint NOT NULL,
	CONSTRAINT "sync_user_id_kind_pk" PRIMARY KEY("user_id","kind")
);
--> statement-breakpoint
ALTER TABLE "sync" ADD CONSTRAINT "sync_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;