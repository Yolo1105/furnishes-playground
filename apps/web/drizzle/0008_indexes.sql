CREATE INDEX "cost_log_caller_at_idx" ON "cost_log" USING btree ("caller","at");--> statement-breakpoint
CREATE INDEX "orders_payment_intent_ref_idx" ON "orders" USING btree ("payment_intent_ref");