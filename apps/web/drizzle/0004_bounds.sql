CREATE TABLE "cost_log" (
	"id" text PRIMARY KEY NOT NULL,
	"caller" text NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"model" text,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"usd" double precision NOT NULL,
	"at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "help_request" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"context" text,
	"at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" bigint NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"email" text PRIMARY KEY NOT NULL,
	"at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "help_request" ADD CONSTRAINT "help_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_log_at_idx" ON "cost_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "help_request_user_id_idx" ON "help_request" USING btree ("user_id");