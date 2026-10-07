ALTER TABLE "help_request" ADD COLUMN "answered_at" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "notified_at" bigint;