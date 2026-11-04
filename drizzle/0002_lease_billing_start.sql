ALTER TABLE "invoices" ADD COLUMN "covers_from" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "covers_to" date;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "billing_start_period" date;