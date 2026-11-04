CREATE TYPE "public"."complaint_category" AS ENUM('electricity', 'water', 'ac', 'internet', 'cleanliness', 'security', 'facility', 'neighbor', 'other');--> statement-breakpoint
CREATE TYPE "public"."complaint_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('open', 'in_progress', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."deposit_status" AS ENUM('held', 'refunded', 'partial_refund', 'forfeited', 'transferred');--> statement-breakpoint
CREATE TYPE "public"."invoice_item_type" AS ENUM('rent', 'electricity', 'water', 'laundry', 'late_fee', 'discount', 'other');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'partial', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."lease_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'manager');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('reminder_before', 'reminder_due', 'reminder_overdue_1', 'reminder_overdue_3', 'reminder_overdue_7', 'payment_confirmed', 'payment_rejected', 'welcome', 'complaint_new_owner', 'complaint_update', 'proof_uploaded_owner', 'broadcast', 'manual');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'transfer', 'qris', 'va', 'ewallet', 'credit', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('vacant', 'occupied', 'reserved', 'maintenance');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_entity_type" CHECK ("attachments"."entity_type" in ('complaint', 'complaint_update', 'expense', 'room')),
	CONSTRAINT "attachments_size_limit" CHECK ("attachments"."size_bytes" <= 5242880)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"property_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"audience" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaint_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complaint_id" uuid NOT NULL,
	"author_type" text NOT NULL,
	"author_user_id" uuid,
	"from_status" "complaint_status",
	"to_status" "complaint_status",
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaint_updates_author_type" CHECK ("complaint_updates"."author_type" in ('tenant', 'staff', 'system'))
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"number" integer DEFAULT 0 NOT NULL,
	"tenant_id" uuid,
	"room_id" uuid,
	"location" text,
	"category" "complaint_category" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" "complaint_priority" DEFAULT 'medium' NOT NULL,
	"status" "complaint_status" DEFAULT 'open' NOT NULL,
	"assignee_name" text,
	"assignee_phone" text,
	"cost" bigint,
	"rating" smallint,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaints_rating_range" CHECK ("complaints"."rating" is null or "complaints"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"category" text NOT NULL,
	"amount" bigint NOT NULL,
	"spent_on" date NOT NULL,
	"description" text,
	"complaint_id" uuid,
	"receipt_path" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount" > 0),
	CONSTRAINT "expenses_category" CHECK ("expenses"."category" in ('electricity', 'water', 'internet', 'cleaning', 'repair', 'salary', 'tax', 'other'))
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"type" "invoice_item_type" NOT NULL,
	"description" text NOT NULL,
	"amount" bigint NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"number" text NOT NULL,
	"period" date NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"paid_at" timestamp with time zone,
	"void_reason" text,
	"payment_link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_paid_nonnegative" CHECK ("invoices"."paid_amount" >= 0),
	CONSTRAINT "invoices_period_first_day" CHECK (extract(day from "invoices"."period") = 1)
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"property_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"error" text,
	CONSTRAINT "job_runs_status" CHECK ("job_runs"."status" in ('running', 'success', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"monthly_rent" bigint NOT NULL,
	"billing_day" smallint NOT NULL,
	"deposit_amount" bigint DEFAULT 0 NOT NULL,
	"deposit_status" "deposit_status" DEFAULT 'held' NOT NULL,
	"deposit_refunded" bigint DEFAULT 0 NOT NULL,
	"status" "lease_status" DEFAULT 'active' NOT NULL,
	"ended_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leases_billing_day_range" CHECK ("leases"."billing_day" between 1 and 28),
	CONSTRAINT "leases_rent_nonnegative" CHECK ("leases"."monthly_rent" >= 0),
	CONSTRAINT "leases_end_after_start" CHECK ("leases"."end_date" is null or "leases"."end_date" >= "leases"."start_date")
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"type" "message_type" NOT NULL,
	"body" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"tenant_id" uuid,
	"to_phone" text NOT NULL,
	"type" "message_type" NOT NULL,
	"invoice_id" uuid,
	"complaint_id" uuid,
	"broadcast_id" uuid,
	"body" text NOT NULL,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" NOT NULL,
	"proof_path" text,
	"submitted_by" text NOT NULL,
	"recorded_by" uuid,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"rejection_reason" text,
	"gateway_ref" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_gateway_ref_unique" UNIQUE("gateway_ref"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_submitted_by" CHECK ("payments"."submitted_by" in ('tenant', 'staff', 'gateway'))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"contact_phone" text,
	"rules" text,
	"created_by" uuid DEFAULT auth.uid(),
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_code_unique" UNIQUE("code"),
	CONSTRAINT "properties_code_format" CHECK ("properties"."code" ~ '^[A-Z0-9]{2,5}$')
);
--> statement-breakpoint
CREATE TABLE "property_members" (
	"property_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"can_view_finance" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_members_property_id_user_id_pk" PRIMARY KEY("property_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "property_settings" (
	"property_id" uuid PRIMARY KEY NOT NULL,
	"invoice_lead_days" smallint DEFAULT 7 NOT NULL,
	"reminder_offsets" smallint[] DEFAULT '{-3,0,1,3,7}'::smallint[] NOT NULL,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"quiet_start" time DEFAULT '20:00' NOT NULL,
	"quiet_end" time DEFAULT '08:00' NOT NULL,
	"late_fee_type" text DEFAULT 'none' NOT NULL,
	"late_fee_amount" bigint DEFAULT 0 NOT NULL,
	"late_fee_max" bigint,
	"late_fee_grace_days" smallint DEFAULT 3 NOT NULL,
	"bank_accounts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"wa_provider" text DEFAULT 'fonnte' NOT NULL,
	"prorate_first_month" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_settings_late_fee_type" CHECK ("property_settings"."late_fee_type" in ('none', 'fixed', 'daily')),
	CONSTRAINT "property_settings_lead_days" CHECK ("property_settings"."invoice_lead_days" between 0 and 28)
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"code" text NOT NULL,
	"floor" smallint,
	"type" text,
	"capacity" smallint DEFAULT 1 NOT NULL,
	"monthly_price" bigint NOT NULL,
	"deposit_amount" bigint DEFAULT 0 NOT NULL,
	"facilities" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "room_status" DEFAULT 'vacant' NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_capacity_positive" CHECK ("rooms"."capacity" >= 1),
	CONSTRAINT "rooms_price_nonnegative" CHECK ("rooms"."monthly_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tenant_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"source_payment_id" uuid,
	"applied_invoice_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"nik_encrypted" text,
	"nik_last4" text,
	"id_card_path" text,
	"occupation" text,
	"emergency_name" text,
	"emergency_relation" text,
	"emergency_phone" text,
	"reminders_muted" boolean DEFAULT false NOT NULL,
	"portal_token_hash" text,
	"portal_token_created_at" timestamp with time zone,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_portal_token_hash_unique" UNIQUE("portal_token_hash"),
	CONSTRAINT "tenants_phone_format" CHECK ("tenants"."phone" ~ '^62[0-9]{8,13}$')
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_updates" ADD CONSTRAINT "complaint_updates_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_updates" ADD CONSTRAINT "complaint_updates_author_user_id_profiles_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_members" ADD CONSTRAINT "property_members_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_members" ADD CONSTRAINT "property_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_settings" ADD CONSTRAINT "property_settings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_credits" ADD CONSTRAINT "tenant_credits_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_credits" ADD CONSTRAINT "tenant_credits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_credits" ADD CONSTRAINT "tenant_credits_source_payment_id_payments_id_fk" FOREIGN KEY ("source_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_credits" ADD CONSTRAINT "tenant_credits_applied_invoice_id_invoices_id_fk" FOREIGN KEY ("applied_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_entity_idx" ON "attachments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_property_created_idx" ON "audit_logs" USING btree ("property_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "complaint_updates_complaint_idx" ON "complaint_updates" USING btree ("complaint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "complaints_property_number_uq" ON "complaints" USING btree ("property_id","number");--> statement-breakpoint
CREATE INDEX "complaints_property_status_idx" ON "complaints" USING btree ("property_id","status");--> statement-breakpoint
CREATE INDEX "expenses_property_spent_idx" ON "expenses" USING btree ("property_id","spent_on");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_lease_period_uq" ON "invoices" USING btree ("lease_id","period");--> statement-breakpoint
CREATE INDEX "invoices_property_period_idx" ON "invoices" USING btree ("property_id","period");--> statement-breakpoint
CREATE INDEX "invoices_property_status_due_idx" ON "invoices" USING btree ("property_id","status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_tenant_idx" ON "invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "job_runs_job_started_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "leases_property_status_idx" ON "leases" USING btree ("property_id","status");--> statement-breakpoint
CREATE INDEX "leases_tenant_idx" ON "leases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "leases_room_idx" ON "leases" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_property_type_uq" ON "message_templates" USING btree ("property_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_one_reminder_per_type_uq" ON "messages" USING btree ("invoice_id","type") WHERE "messages"."invoice_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_queue_idx" ON "messages" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "messages_property_created_idx" ON "messages" USING btree ("property_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_property_status_idx" ON "payments" USING btree ("property_id","status");--> statement-breakpoint
CREATE INDEX "property_members_user_idx" ON "property_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_property_code_uq" ON "rooms" USING btree ("property_id","code");--> statement-breakpoint
CREATE INDEX "tenant_credits_tenant_idx" ON "tenant_credits" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenants_property_idx" ON "tenants" USING btree ("property_id");