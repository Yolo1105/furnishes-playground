CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"key" text NOT NULL,
	"status" text NOT NULL,
	"lines" jsonb NOT NULL,
	"total" integer NOT NULL,
	"address" jsonb NOT NULL,
	"payment_ref" text,
	"payment_intent_ref" text,
	"at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_event" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"order_id" text,
	"at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_payment_ref_idx" ON "orders" USING btree ("payment_ref");