/**
 * Skema database Kosku — lihat specs/04-database.md.
 *
 * Konvensi:
 * - Uang: bigint Rupiah utuh (mode "number" aman sampai ±9 kuadriliun).
 * - Waktu: timestamptz (UTC). Tanggal kalender: date (string "YYYY-MM-DD").
 * - Trigger, RLS, dan constraint parsial ditulis di migrasi SQL kustom
 *   (drizzle/0001_*.sql), bukan di file ini.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

// ---------------------------------------------------------------------------
// Helper kolom
// ---------------------------------------------------------------------------

const id = () => uuid("id").primaryKey().defaultRandom();
const money = (name: string) => bigint(name, { mode: "number" });
const tstz = (name: string) => timestamp(name, { withTimezone: true });
const timestamps = {
  createdAt: tstz("created_at").defaultNow().notNull(),
  updatedAt: tstz("updated_at").defaultNow().notNull(),
};
const propertyRef = () =>
  uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" });

// ---------------------------------------------------------------------------
// Enum
// ---------------------------------------------------------------------------

export const memberRole = pgEnum("member_role", ["owner", "manager"]);
export const roomStatus = pgEnum("room_status", ["vacant", "occupied", "reserved", "maintenance"]);
export const leaseStatus = pgEnum("lease_status", ["active", "ended"]);
export const depositStatus = pgEnum("deposit_status", [
  "held",
  "refunded",
  "partial_refund",
  "forfeited",
  "transferred",
]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "issued", "partial", "paid", "void"]);
export const invoiceItemType = pgEnum("invoice_item_type", [
  "rent",
  "electricity",
  "water",
  "laundry",
  "late_fee",
  "discount",
  "other",
]);
export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "transfer",
  "qris",
  "va",
  "ewallet",
  "credit",
  "other",
]);
export const paymentStatus = pgEnum("payment_status", ["pending", "verified", "rejected"]);
export const complaintCategory = pgEnum("complaint_category", [
  "electricity",
  "water",
  "ac",
  "internet",
  "cleanliness",
  "security",
  "facility",
  "neighbor",
  "other",
]);
export const complaintPriority = pgEnum("complaint_priority", ["low", "medium", "high", "urgent"]);
export const complaintStatus = pgEnum("complaint_status", ["open", "in_progress", "resolved", "rejected"]);
export const messageType = pgEnum("message_type", [
  "reminder_before",
  "reminder_due",
  "reminder_overdue_1",
  "reminder_overdue_3",
  "reminder_overdue_7",
  "payment_confirmed",
  "payment_rejected",
  "welcome",
  "complaint_new_owner",
  "complaint_update",
  "proof_uploaded_owner",
  "broadcast",
  "manual",
]);
export const messageStatus = pgEnum("message_status", [
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "skipped",
]);

// ---------------------------------------------------------------------------
// 3.1 Pengguna & properti
// ---------------------------------------------------------------------------

export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull().default(""),
  phone: text("phone"),
  ...timestamps,
});

export const properties = pgTable(
  "properties",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    address: text("address"),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    contactPhone: text("contact_phone"),
    rules: text("rules"),
    /** Pembuat properti; diisi otomatis dari sesi (auth.uid()). */
    createdBy: uuid("created_by").default(sql`auth.uid()`),
    archivedAt: tstz("archived_at"),
    ...timestamps,
  },
  (t) => [check("properties_code_format", sql`${t.code} ~ '^[A-Z0-9]{2,5}$'`)],
);

export const propertyMembers = pgTable(
  "property_members",
  {
    propertyId: propertyRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    canViewFinance: boolean("can_view_finance").notNull().default(false),
    createdAt: tstz("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.propertyId, t.userId] }), index("property_members_user_idx").on(t.userId)],
);

export type BankAccount = { bank: string; number: string; holder: string };

export const propertySettings = pgTable(
  "property_settings",
  {
    propertyId: uuid("property_id")
      .primaryKey()
      .references(() => properties.id, { onDelete: "cascade" }),
    invoiceLeadDays: smallint("invoice_lead_days").notNull().default(7),
    reminderOffsets: smallint("reminder_offsets")
      .array()
      .notNull()
      .default(sql`'{-3,0,1,3,7}'::smallint[]`),
    remindersEnabled: boolean("reminders_enabled").notNull().default(true),
    quietStart: time("quiet_start").notNull().default("20:00"),
    quietEnd: time("quiet_end").notNull().default("08:00"),
    lateFeeType: text("late_fee_type").notNull().default("none"),
    lateFeeAmount: money("late_fee_amount").notNull().default(0),
    lateFeeMax: money("late_fee_max"),
    lateFeeGraceDays: smallint("late_fee_grace_days").notNull().default(3),
    bankAccounts: jsonb("bank_accounts")
      .$type<BankAccount[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    waProvider: text("wa_provider").notNull().default("fonnte"),
    prorateFirstMonth: boolean("prorate_first_month").notNull().default(true),
    updatedAt: tstz("updated_at").defaultNow().notNull(),
  },
  (t) => [
    check("property_settings_late_fee_type", sql`${t.lateFeeType} in ('none', 'fixed', 'daily')`),
    check("property_settings_lead_days", sql`${t.invoiceLeadDays} between 0 and 28`),
  ],
);

// ---------------------------------------------------------------------------
// 3.2 Kamar, penghuni, sewa
// ---------------------------------------------------------------------------

export const rooms = pgTable(
  "rooms",
  {
    id: id(),
    propertyId: propertyRef(),
    code: text("code").notNull(),
    floor: smallint("floor"),
    type: text("type"),
    capacity: smallint("capacity").notNull().default(1),
    monthlyPrice: money("monthly_price").notNull(),
    depositAmount: money("deposit_amount").notNull().default(0),
    facilities: text("facilities")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: roomStatus("status").notNull().default("vacant"),
    notes: text("notes"),
    archivedAt: tstz("archived_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("rooms_property_code_uq").on(t.propertyId, t.code),
    check("rooms_capacity_positive", sql`${t.capacity} >= 1`),
    check("rooms_price_nonnegative", sql`${t.monthlyPrice} >= 0`),
  ],
);

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    propertyId: propertyRef(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    nikEncrypted: text("nik_encrypted"),
    nikLast4: text("nik_last4"),
    idCardPath: text("id_card_path"),
    occupation: text("occupation"),
    emergencyName: text("emergency_name"),
    emergencyRelation: text("emergency_relation"),
    emergencyPhone: text("emergency_phone"),
    remindersMuted: boolean("reminders_muted").notNull().default(false),
    portalTokenHash: text("portal_token_hash").unique(),
    /** Dinaikkan untuk mencabut link portal lama (lihat src/lib/portal-token.ts). */
    portalTokenVersion: smallint("portal_token_version").notNull().default(1),
    portalTokenCreatedAt: tstz("portal_token_created_at"),
    notes: text("notes"),
    archivedAt: tstz("archived_at"),
    ...timestamps,
  },
  (t) => [
    index("tenants_property_idx").on(t.propertyId),
    check("tenants_phone_format", sql`${t.phone} ~ '^62[0-9]{8,13}$'`),
  ],
);

export const leases = pgTable(
  "leases",
  {
    id: id(),
    propertyId: propertyRef(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    monthlyRent: money("monthly_rent").notNull(),
    billingDay: smallint("billing_day").notNull(),
    /** Penghuni lama yang baru dimasukkan: periode sebelum ini tidak ditagih. */
    billingStartPeriod: date("billing_start_period"),
    depositAmount: money("deposit_amount").notNull().default(0),
    depositStatus: depositStatus("deposit_status").notNull().default("held"),
    depositRefunded: money("deposit_refunded").notNull().default(0),
    status: leaseStatus("status").notNull().default("active"),
    endedReason: text("ended_reason"),
    ...timestamps,
  },
  (t) => [
    index("leases_property_status_idx").on(t.propertyId, t.status),
    index("leases_tenant_idx").on(t.tenantId),
    index("leases_room_idx").on(t.roomId),
    check("leases_billing_day_range", sql`${t.billingDay} between 1 and 28`),
    check("leases_rent_nonnegative", sql`${t.monthlyRent} >= 0`),
    check("leases_end_after_start", sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
  ],
);

// ---------------------------------------------------------------------------
// 3.3 Tagihan & pembayaran
// ---------------------------------------------------------------------------

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    propertyId: propertyRef(),
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => leases.id, { onDelete: "restrict" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    number: text("number").notNull().unique(),
    period: date("period").notNull(),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    /** Rentang siklus yang ditagih: [covers_from, covers_to) */
    coversFrom: date("covers_from"),
    coversTo: date("covers_to"),
    total: money("total").notNull().default(0),
    paidAmount: money("paid_amount").notNull().default(0),
    status: invoiceStatus("status").notNull().default("issued"),
    paidAt: tstz("paid_at"),
    voidReason: text("void_reason"),
    paymentLink: text("payment_link"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invoices_lease_period_uq").on(t.leaseId, t.period),
    index("invoices_property_period_idx").on(t.propertyId, t.period),
    index("invoices_property_status_due_idx").on(t.propertyId, t.status, t.dueDate),
    index("invoices_tenant_idx").on(t.tenantId),
    check("invoices_paid_nonnegative", sql`${t.paidAmount} >= 0`),
    check("invoices_period_first_day", sql`extract(day from ${t.period}) = 1`),
  ],
);

export type InvoiceItemMeta = Record<string, unknown>;

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    type: invoiceItemType("type").notNull(),
    description: text("description").notNull(),
    amount: money("amount").notNull(),
    meta: jsonb("meta").$type<InvoiceItemMeta>(),
    createdAt: tstz("created_at").defaultNow().notNull(),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    propertyId: propertyRef(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    paidAt: tstz("paid_at").notNull(),
    method: paymentMethod("method").notNull(),
    status: paymentStatus("status").notNull(),
    proofPath: text("proof_path"),
    submittedBy: text("submitted_by").notNull(),
    recordedBy: uuid("recorded_by").references(() => profiles.id),
    verifiedBy: uuid("verified_by").references(() => profiles.id),
    verifiedAt: tstz("verified_at"),
    rejectionReason: text("rejection_reason"),
    gatewayRef: text("gateway_ref").unique(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_property_status_idx").on(t.propertyId, t.status),
    check("payments_amount_positive", sql`${t.amount} > 0`),
    check("payments_submitted_by", sql`${t.submittedBy} in ('tenant', 'staff', 'gateway', 'system')`),
  ],
);

export const tenantCredits = pgTable(
  "tenant_credits",
  {
    id: id(),
    propertyId: propertyRef(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    sourcePaymentId: uuid("source_payment_id").references(() => payments.id),
    appliedInvoiceId: uuid("applied_invoice_id").references(() => invoices.id),
    note: text("note"),
    createdAt: tstz("created_at").defaultNow().notNull(),
  },
  (t) => [index("tenant_credits_tenant_idx").on(t.tenantId)],
);

// ---------------------------------------------------------------------------
// 3.4 Komplain
// ---------------------------------------------------------------------------

export const complaints = pgTable(
  "complaints",
  {
    id: id(),
    propertyId: propertyRef(),
    /** Nomor urut per properti (#24), diisi trigger. */
    number: integer("number").notNull().default(0),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    roomId: uuid("room_id").references(() => rooms.id, {
      onDelete: "set null",
    }),
    location: text("location"),
    category: complaintCategory("category").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    priority: complaintPriority("priority").notNull().default("medium"),
    status: complaintStatus("status").notNull().default("open"),
    assigneeName: text("assignee_name"),
    assigneePhone: text("assignee_phone"),
    cost: money("cost"),
    rating: smallint("rating"),
    resolvedAt: tstz("resolved_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("complaints_property_number_uq").on(t.propertyId, t.number),
    index("complaints_property_status_idx").on(t.propertyId, t.status),
    check("complaints_rating_range", sql`${t.rating} is null or ${t.rating} between 1 and 5`),
  ],
);

export const complaintUpdates = pgTable(
  "complaint_updates",
  {
    id: id(),
    complaintId: uuid("complaint_id")
      .notNull()
      .references(() => complaints.id, { onDelete: "cascade" }),
    authorType: text("author_type").notNull(),
    authorUserId: uuid("author_user_id").references(() => profiles.id),
    fromStatus: complaintStatus("from_status"),
    toStatus: complaintStatus("to_status"),
    body: text("body"),
    createdAt: tstz("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("complaint_updates_complaint_idx").on(t.complaintId),
    check("complaint_updates_author_type", sql`${t.authorType} in ('tenant', 'staff', 'system')`),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    propertyId: propertyRef(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    path: text("path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: tstz("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("attachments_entity_idx").on(t.entityType, t.entityId),
    check(
      "attachments_entity_type",
      sql`${t.entityType} in ('complaint', 'complaint_update', 'expense', 'room')`,
    ),
    check("attachments_size_limit", sql`${t.sizeBytes} <= 5242880`),
  ],
);

// ---------------------------------------------------------------------------
// 3.5 WhatsApp
// ---------------------------------------------------------------------------

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: id(),
    propertyId: propertyRef(),
    type: messageType("type").notNull(),
    body: text("body").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("message_templates_property_type_uq").on(t.propertyId, t.type)],
);

export type BroadcastAudience = { all: true } | { floors: number[] } | { tenantIds: string[] };

export const broadcasts = pgTable("broadcasts", {
  id: id(),
  propertyId: propertyRef(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audience: jsonb("audience").$type<BroadcastAudience>().notNull(),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: tstz("created_at").defaultNow().notNull(),
});

export const messages = pgTable(
  "messages",
  {
    id: id(),
    propertyId: propertyRef(),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    toPhone: text("to_phone").notNull(),
    type: messageType("type").notNull(),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    complaintId: uuid("complaint_id").references(() => complaints.id),
    broadcastId: uuid("broadcast_id").references(() => broadcasts.id),
    body: text("body").notNull(),
    status: messageStatus("status").notNull().default("queued"),
    scheduledAt: tstz("scheduled_at").notNull().defaultNow(),
    attempts: smallint("attempts").notNull().default(0),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: tstz("sent_at"),
    ...timestamps,
  },
  (t) => [
    // satu jenis pengingat hanya sekali per tagihan (FR-5.3)
    // Satu jenis PENGINGAT hanya sekali per tagihan (FR-5.3). Konfirmasi
    // pembayaran boleh berkali-kali (cicilan).
    uniqueIndex("messages_one_reminder_per_type_uq")
      .on(t.invoiceId, t.type)
      .where(
        sql`${t.invoiceId} is not null and ${t.type} in ('reminder_before', 'reminder_due', 'reminder_overdue_1', 'reminder_overdue_3', 'reminder_overdue_7')`,
      ),
    index("messages_queue_idx").on(t.status, t.scheduledAt),
    index("messages_property_created_idx").on(t.propertyId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// 3.6 Keuangan & sistem
// ---------------------------------------------------------------------------

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    propertyId: propertyRef(),
    category: text("category").notNull(),
    amount: money("amount").notNull(),
    spentOn: date("spent_on").notNull(),
    description: text("description"),
    complaintId: uuid("complaint_id").references(() => complaints.id),
    receiptPath: text("receipt_path"),
    createdBy: uuid("created_by").references(() => profiles.id),
    ...timestamps,
  },
  (t) => [
    index("expenses_property_spent_idx").on(t.propertyId, t.spentOn),
    check("expenses_amount_positive", sql`${t.amount} > 0`),
    check(
      "expenses_category",
      sql`${t.category} in ('electricity', 'water', 'internet', 'cleaning', 'repair', 'salary', 'tax', 'other')`,
    ),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "cascade",
    }),
    actorType: text("actor_type").notNull(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: tstz("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_logs_property_created_idx").on(t.propertyId, t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    job: text("job").notNull(),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "cascade",
    }),
    startedAt: tstz("started_at").defaultNow().notNull(),
    finishedAt: tstz("finished_at"),
    status: text("status").notNull().default("running"),
    processed: integer("processed").notNull().default(0),
    error: text("error"),
  },
  (t) => [
    index("job_runs_job_started_idx").on(t.job, t.startedAt),
    check("job_runs_status", sql`${t.status} in ('running', 'success', 'failed')`),
  ],
);
