/**
 * Pesan WhatsApp: link portal, template, antrian, notifikasi kejadian,
 * jadwal pengingat, dan worker pengirim (specs/02 M5, specs/05 § 2 & 4).
 *
 * Semua pesan masuk ke tabel `messages` dulu (status "queued"), lalu dikirim
 * oleh `sendQueued`. Dengan begitu setiap pesan tercatat, bisa dikirim ulang,
 * dan aturan jam tenang/anti-dobel berlaku sama untuk semua jenis pesan.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import {
  broadcasts,
  complaints,
  invoiceItems,
  invoices,
  leases,
  messages,
  messageTemplates,
  payments,
  properties,
  propertySettings,
  rooms,
  tenants,
  type BroadcastAudience,
} from "@/db/schema";
import { addDays, todayIn, type IsoDate } from "@/lib/billing";
import { formatRupiah } from "@/lib/format";
import { shouldAdvance, type DeliveryStatus } from "@/lib/messaging/provider-status";
import { nextAllowedTime, reminderDue } from "@/lib/messaging/schedule";
import {
  DEFAULT_TEMPLATES,
  renderTemplate,
  type TemplateType,
  type TemplateVars,
} from "@/lib/messaging/templates";
import { invoiceVars } from "@/lib/messaging/vars";
import { hashPortalToken, portalToken } from "@/lib/portal-token";
import { audit, must, ServiceError, type Actor } from "./core";
import type { WhatsAppProvider } from "./whatsapp";

type MessageType = (typeof messages.$inferInsert)["type"];

// ---------------------------------------------------------------------------
// Konfigurasi & link portal
// ---------------------------------------------------------------------------

export type MessagingConfig = { appUrl: string; portalSecret: string | null };

export function configFromEnv(env: Record<string, string | undefined> = process.env): MessagingConfig {
  return {
    appUrl: (env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
    portalSecret: env.PORTAL_SECRET && env.PORTAL_SECRET.length >= 16 ? env.PORTAL_SECRET : null,
  };
}

/**
 * Link portal penghuni. Menyimpan hash token bila belum ada/berubah.
 * Tanpa PORTAL_SECRET → link portal belum aktif.
 */
export async function ensurePortalLink(
  tx: Tx,
  tenantId: string,
  cfg: MessagingConfig,
): Promise<string | null> {
  if (!cfg.portalSecret) return null;
  const [tenant] = await tx
    .select({ version: tenants.portalTokenVersion, hash: tenants.portalTokenHash })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) return null;
  const token = portalToken(cfg.portalSecret, tenantId, tenant.version);
  const hash = hashPortalToken(token);
  if (tenant.hash !== hash) {
    await tx
      .update(tenants)
      .set({ portalTokenHash: hash, portalTokenCreatedAt: new Date() })
      .where(eq(tenants.id, tenantId));
  }
  return `${cfg.appUrl}/p/${token}`;
}

/** Cabut link lama & buat link baru (FR-8.3). */
export async function rotatePortalLink(tx: Tx, actor: Actor, tenantId: string, cfg: MessagingConfig) {
  if (!cfg.portalSecret) throw new ServiceError("PORTAL_SECRET belum diatur, link portal belum bisa dibuat.");
  const [tenant] = await tx
    .update(tenants)
    .set({ portalTokenVersion: sql`${tenants.portalTokenVersion} + 1` })
    .where(eq(tenants.id, tenantId))
    .returning({ propertyId: tenants.propertyId });
  must(tenant, "Penghuni");
  const url = await ensurePortalLink(tx, tenantId, cfg);
  await audit(tx, actor, {
    propertyId: tenant.propertyId,
    action: "tenant.portal_rotate",
    entityType: "tenant",
    entityId: tenantId,
  });
  return url;
}

// ---------------------------------------------------------------------------
// Template & antrian
// ---------------------------------------------------------------------------

export async function templateFor(tx: Tx, propertyId: string, type: TemplateType) {
  const [row] = await tx
    .select({ body: messageTemplates.body, enabled: messageTemplates.enabled })
    .from(messageTemplates)
    .where(and(eq(messageTemplates.propertyId, propertyId), eq(messageTemplates.type, type)));
  return row ?? { body: DEFAULT_TEMPLATES[type], enabled: true };
}

export async function saveTemplate(
  tx: Tx,
  actor: Actor,
  propertyId: string,
  type: TemplateType,
  input: { body: string; enabled: boolean },
) {
  if (!input.body.trim()) throw new ServiceError("Isi template tidak boleh kosong.", "body");
  await tx
    .insert(messageTemplates)
    .values({ propertyId, type, body: input.body, enabled: input.enabled })
    .onConflictDoUpdate({
      target: [messageTemplates.propertyId, messageTemplates.type],
      set: { body: input.body, enabled: input.enabled, updatedAt: new Date() },
    });
  await audit(tx, actor, {
    propertyId,
    action: "template.update",
    entityType: "message_template",
    after: { type, ...input },
  });
}

async function settingsOf(tx: Tx, propertyId: string) {
  const [row] = await tx
    .select({ property: properties, settings: propertySettings })
    .from(properties)
    .innerJoin(propertySettings, eq(propertySettings.propertyId, properties.id))
    .where(eq(properties.id, propertyId));
  return must(row, "Properti");
}

type EnqueueInput = {
  propertyId: string;
  tenantId?: string | null;
  toPhone: string;
  type: MessageType;
  body: string;
  invoiceId?: string | null;
  complaintId?: string | null;
  broadcastId?: string | null;
  now?: Date;
  /** untuk pesan uji: kirim segera walau jam tenang */
  ignoreQuietHours?: boolean;
};

/** Masukkan pesan ke antrian, menghormati jam tenang properti. Null bila sudah ada (pengingat ganda). */
export async function enqueue(tx: Tx, input: EnqueueInput) {
  const { settings, property } = await settingsOf(tx, input.propertyId);
  const now = input.now ?? new Date();
  const scheduledAt = input.ignoreQuietHours
    ? now
    : nextAllowedTime(now, property.timezone, settings.quietStart, settings.quietEnd);
  const [row] = await tx
    .insert(messages)
    .values({
      propertyId: input.propertyId,
      tenantId: input.tenantId ?? null,
      toPhone: input.toPhone,
      type: input.type,
      body: input.body,
      invoiceId: input.invoiceId ?? null,
      complaintId: input.complaintId ?? null,
      broadcastId: input.broadcastId ?? null,
      scheduledAt,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

async function enqueueFromTemplate(
  tx: Tx,
  type: TemplateType,
  vars: TemplateVars,
  input: Omit<EnqueueInput, "type" | "body">,
) {
  const template = await templateFor(tx, input.propertyId, type);
  if (!template.enabled) return null;
  return enqueue(tx, { ...input, type, body: renderTemplate(template.body, vars) });
}

// ---------------------------------------------------------------------------
// Variabel dari tagihan
// ---------------------------------------------------------------------------

async function invoiceContext(tx: Tx, invoiceId: string, cfg: MessagingConfig, today?: IsoDate) {
  const [row] = await tx
    .select({
      invoice: invoices,
      tenant: tenants,
      roomCode: rooms.code,
      property: properties,
      settings: propertySettings,
      billingDay: leases.billingDay,
    })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .innerJoin(rooms, eq(rooms.id, invoices.roomId))
    .innerJoin(leases, eq(leases.id, invoices.leaseId))
    .innerJoin(properties, eq(properties.id, invoices.propertyId))
    .innerJoin(propertySettings, eq(propertySettings.propertyId, invoices.propertyId))
    .where(eq(invoices.id, invoiceId));
  const ctx = must(row, "Tagihan");
  const [fee] = await tx
    .select({ total: sql<number>`coalesce(sum(${invoiceItems.amount}), 0)`.mapWith(Number) })
    .from(invoiceItems)
    .where(and(eq(invoiceItems.invoiceId, invoiceId), eq(invoiceItems.type, "late_fee")));
  const portalLink = await ensurePortalLink(tx, ctx.tenant.id, cfg);
  const portal = portalLink ?? "(hubungi pengelola)";
  const vars = invoiceVars({
    tenantName: ctx.tenant.fullName,
    roomCode: ctx.roomCode,
    propertyName: ctx.property.name,
    period: ctx.invoice.period,
    dueDate: ctx.invoice.dueDate,
    total: ctx.invoice.total,
    paidAmount: ctx.invoice.paidAmount,
    lateFee: fee?.total ?? 0,
    billingDay: ctx.billingDay,
    bankAccounts: ctx.settings.bankAccounts,
    portalUrl: portal,
    today: today ?? todayIn(ctx.property.timezone),
  });
  // Kuitansi PDF langsung dari portal penghuni
  if (portalLink) vars.link_kuitansi = `${portalLink}/tagihan/${invoiceId}/pdf`;
  return { ...ctx, vars };
}

// ---------------------------------------------------------------------------
// Notifikasi kejadian (FR-5.7)
// ---------------------------------------------------------------------------

export async function notifyPayment(
  tx: Tx,
  paymentId: string,
  kind: "confirmed" | "rejected",
  cfg: MessagingConfig = configFromEnv(),
) {
  const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId));
  if (!payment || payment.method === "credit") return null;
  const ctx = await invoiceContext(tx, payment.invoiceId, cfg);
  return enqueueFromTemplate(
    tx,
    kind === "confirmed" ? "payment_confirmed" : "payment_rejected",
    { ...ctx.vars, nominal: formatRupiah(payment.amount), alasan: payment.rejectionReason ?? "-" },
    {
      propertyId: ctx.invoice.propertyId,
      tenantId: ctx.tenant.id,
      toPhone: ctx.tenant.phone,
      invoiceId: ctx.invoice.id,
    },
  );
}

/** Bukti bayar baru dari portal → pengelola (no. WA di data kos). */
export async function notifyProofUploaded(tx: Tx, paymentId: string, cfg: MessagingConfig = configFromEnv()) {
  const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId));
  if (!payment) return null;
  const ctx = await invoiceContext(tx, payment.invoiceId, cfg);
  if (!ctx.property.contactPhone) return null;
  return enqueueFromTemplate(
    tx,
    "proof_uploaded_owner",
    { ...ctx.vars, nominal: formatRupiah(payment.amount), link_admin: `${cfg.appUrl}/pembayaran` },
    { propertyId: ctx.invoice.propertyId, toPhone: ctx.property.contactPhone, invoiceId: ctx.invoice.id },
  );
}

export async function notifyWelcome(tx: Tx, leaseId: string, cfg: MessagingConfig = configFromEnv()) {
  const [row] = await tx
    .select({ lease: leases, tenant: tenants, roomCode: rooms.code, property: properties })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(eq(leases.id, leaseId));
  if (!row) return null;
  const portal = (await ensurePortalLink(tx, row.tenant.id, cfg)) ?? "(akan dikirim menyusul)";
  return enqueueFromTemplate(
    tx,
    "welcome",
    {
      nama: row.tenant.fullName,
      nama_kos: row.property.name,
      kamar: row.roomCode,
      nominal: formatRupiah(row.lease.monthlyRent),
      tgl_tagih: row.lease.billingDay,
      link_portal: portal,
    },
    { propertyId: row.lease.propertyId, tenantId: row.tenant.id, toPhone: row.tenant.phone },
  );
}

const COMPLAINT_STATUS_LABEL = {
  open: "Baru",
  in_progress: "Diproses",
  resolved: "Selesai",
  rejected: "Ditolak",
} as const;
const PRIORITY_LABEL = { low: "Rendah", medium: "Sedang", high: "Tinggi", urgent: "Darurat" } as const;

async function complaintContext(tx: Tx, complaintId: string) {
  const [row] = await tx
    .select({ complaint: complaints, tenant: tenants, roomCode: rooms.code, property: properties })
    .from(complaints)
    .innerJoin(properties, eq(properties.id, complaints.propertyId))
    .leftJoin(tenants, eq(tenants.id, complaints.tenantId))
    .leftJoin(rooms, eq(rooms.id, complaints.roomId))
    .where(eq(complaints.id, complaintId));
  return must(row, "Komplain");
}

export async function notifyComplaintNew(
  tx: Tx,
  complaintId: string,
  cfg: MessagingConfig = configFromEnv(),
) {
  const ctx = await complaintContext(tx, complaintId);
  if (!ctx.property.contactPhone) return null;
  return enqueueFromTemplate(
    tx,
    "complaint_new_owner",
    {
      nomor: ctx.complaint.number,
      judul: ctx.complaint.title,
      prioritas: PRIORITY_LABEL[ctx.complaint.priority],
      lokasi: ctx.roomCode ? `Kamar ${ctx.roomCode}` : (ctx.complaint.location ?? "Area umum"),
      nama: ctx.tenant?.fullName ?? "Pengelola",
      link_admin: `${cfg.appUrl}/komplain/${complaintId}`,
    },
    { propertyId: ctx.complaint.propertyId, toPhone: ctx.property.contactPhone, complaintId },
  );
}

export async function notifyComplaintUpdate(
  tx: Tx,
  complaintId: string,
  note: string | null,
  cfg: MessagingConfig = configFromEnv(),
) {
  const ctx = await complaintContext(tx, complaintId);
  if (!ctx.tenant) return null;
  const portal = (await ensurePortalLink(tx, ctx.tenant.id, cfg)) ?? "";
  return enqueueFromTemplate(
    tx,
    "complaint_update",
    {
      nama: ctx.tenant.fullName,
      nomor: ctx.complaint.number,
      judul: ctx.complaint.title,
      status: COMPLAINT_STATUS_LABEL[ctx.complaint.status],
      catatan_info: note ? `\nCatatan: ${note}` : "",
      link_portal: portal,
    },
    { propertyId: ctx.complaint.propertyId, tenantId: ctx.tenant.id, toPhone: ctx.tenant.phone, complaintId },
  );
}

// ---------------------------------------------------------------------------
// Pengingat terjadwal (job harian)
// ---------------------------------------------------------------------------

export async function scheduleReminders(
  tx: Tx,
  propertyId: string,
  now: Date,
  cfg: MessagingConfig = configFromEnv(),
) {
  const { settings, property } = await settingsOf(tx, propertyId);
  if (!settings.remindersEnabled || settings.reminderOffsets.length === 0) return 0;
  const today = todayIn(property.timezone, now);
  const maxOffset = Math.max(...settings.reminderOffsets);
  const minOffset = Math.min(...settings.reminderOffsets);

  const open = await tx
    .select({ id: invoices.id, dueDate: invoices.dueDate })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .where(
      and(
        eq(invoices.propertyId, propertyId),
        inArray(invoices.status, ["issued", "partial"]),
        eq(tenants.remindersMuted, false),
        isNull(tenants.archivedAt),
        // jatuh tempo dalam jangkauan offset (+1 hari toleransi)
        gte(invoices.dueDate, addDays(today, -(maxOffset + 1))),
        lte(invoices.dueDate, addDays(today, -minOffset)),
      ),
    );

  let count = 0;
  for (const inv of open) {
    const sent = await tx
      .select({ type: messages.type })
      .from(messages)
      .where(eq(messages.invoiceId, inv.id));
    const type = reminderDue(inv.dueDate, today, settings.reminderOffsets, new Set(sent.map((s) => s.type)));
    if (!type) continue;
    const ctx = await invoiceContext(tx, inv.id, cfg, today);
    const row = await enqueueFromTemplate(tx, type, ctx.vars, {
      propertyId,
      tenantId: ctx.tenant.id,
      toPhone: ctx.tenant.phone,
      invoiceId: inv.id,
      now,
    });
    if (row) count++;
  }
  return count;
}

/** Kirim pengingat sekarang untuk satu tagihan (tombol di halaman tagihan). */
export async function remindNow(
  tx: Tx,
  actor: Actor,
  invoiceId: string,
  cfg: MessagingConfig = configFromEnv(),
) {
  const ctx = await invoiceContext(tx, invoiceId, cfg);
  if (ctx.invoice.status !== "issued" && ctx.invoice.status !== "partial") {
    throw new ServiceError("Tagihan ini tidak perlu ditagih.");
  }
  const today = todayIn(ctx.property.timezone);
  const type: TemplateType =
    ctx.invoice.dueDate < today
      ? "reminder_overdue_1"
      : ctx.invoice.dueDate === today
        ? "reminder_due"
        : "reminder_before";
  const template = await templateFor(tx, ctx.invoice.propertyId, type);
  // invoiceId sengaja tidak diisi agar tidak bentrok dengan pengingat otomatis jenis yang sama
  const row = await enqueue(tx, {
    propertyId: ctx.invoice.propertyId,
    tenantId: ctx.tenant.id,
    toPhone: ctx.tenant.phone,
    type: "manual",
    body: renderTemplate(template.body, ctx.vars),
  });
  await audit(tx, actor, {
    propertyId: ctx.invoice.propertyId,
    action: "message.remind_now",
    entityType: "invoice",
    entityId: invoiceId,
  });
  return row;
}

// ---------------------------------------------------------------------------
// Broadcast (FR-5.8)
// ---------------------------------------------------------------------------

export async function createBroadcast(
  tx: Tx,
  actor: Actor,
  propertyId: string,
  input: { title: string; body: string; audience: BroadcastAudience },
) {
  if (!input.body.trim()) throw new ServiceError("Isi pengumuman wajib diisi.", "body");
  const { property } = await settingsOf(tx, propertyId);
  const conditions = [eq(leases.propertyId, propertyId), eq(leases.status, "active")];
  if ("floors" in input.audience && input.audience.floors.length)
    conditions.push(inArray(rooms.floor, input.audience.floors));
  if ("tenantIds" in input.audience && input.audience.tenantIds.length)
    conditions.push(inArray(tenants.id, input.audience.tenantIds));
  const recipients = await tx
    .select({ id: tenants.id, name: tenants.fullName, phone: tenants.phone, roomCode: rooms.code })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .where(and(...conditions));
  if (recipients.length === 0) throw new ServiceError("Tidak ada penghuni aktif yang menjadi penerima.");

  const [broadcast] = await tx
    .insert(broadcasts)
    .values({
      propertyId,
      title: input.title,
      body: input.body,
      audience: input.audience,
      createdBy: actor.id,
    })
    .returning();
  for (const r of recipients) {
    await enqueue(tx, {
      propertyId,
      tenantId: r.id,
      toPhone: r.phone,
      type: "broadcast",
      body: renderTemplate(input.body, { nama: r.name, kamar: r.roomCode, nama_kos: property.name }),
      broadcastId: broadcast.id,
    });
  }
  await audit(tx, actor, {
    propertyId,
    action: "broadcast.create",
    entityType: "broadcast",
    entityId: broadcast.id,
    after: { recipients: recipients.length },
  });
  return { broadcast, recipients: recipients.length };
}

// ---------------------------------------------------------------------------
// Worker pengirim
// ---------------------------------------------------------------------------

const RETRY_MINUTES = [1, 5, 15];
export const MAX_ATTEMPTS = RETRY_MINUTES.length;

type SendOptions = {
  limit?: number;
  delayMs?: number;
  deadlineMs?: number;
  now?: () => Date;
  propertyId?: string;
  /** hanya pesan dengan id ini (mis. pesan uji) */
  onlyIds?: string[];
};

/**
 * Ambil pesan yang sudah waktunya dan kirim. Aman dijalankan paralel
 * (FOR UPDATE SKIP LOCKED). Dibatasi jumlah & waktu agar muat di batas
 * fungsi serverless; sisanya diambil pemanggilan berikutnya.
 */
export async function sendQueued(db: Db, provider: WhatsAppProvider, opts: SendOptions = {}) {
  const limit = opts.limit ?? 20;
  const delayMs = opts.delayMs ?? 2000;
  const deadline = Date.now() + (opts.deadlineMs ?? 45_000);
  const now = opts.now ?? (() => new Date());
  const result = { sent: 0, failed: 0, retried: 0, skipped: 0 };

  // Pulihkan pesan yang macet di "sending" (proses sebelumnya mati di tengah jalan)
  await db
    .update(messages)
    .set({ status: "queued" })
    .where(
      and(eq(messages.status, "sending"), lte(messages.updatedAt, new Date(now().getTime() - 10 * 60_000))),
    );

  const scope = sql.join(
    [
      opts.propertyId ? sql`and property_id = ${opts.propertyId}` : sql``,
      opts.onlyIds?.length
        ? sql`and id in (${sql.join(
            opts.onlyIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`
        : sql``,
    ],
    sql` `,
  );
  const claimed = await db.execute<{ id: string }>(sql`
    update ${messages} set status = 'sending', attempts = attempts + 1, updated_at = now()
    where id in (
      select id from ${messages}
      where status = 'queued' and scheduled_at <= ${now().toISOString()}::timestamptz ${scope}
      order by scheduled_at
      limit ${limit}
      for update skip locked
    )
    returning id`);

  for (const [index, { id }] of claimed.entries()) {
    const [msg] = await db.select().from(messages).where(eq(messages.id, id));
    if (!msg) continue;
    if (Date.now() > deadline) {
      // Kembalikan ke antrian tanpa menghitung percobaan
      await db
        .update(messages)
        .set({ status: "queued", attempts: msg.attempts - 1 })
        .where(eq(messages.id, id));
      continue;
    }

    // Pengingat untuk tagihan yang sudah lunas/batal tidak perlu dikirim (FR-5.2)
    if (msg.invoiceId && msg.type.startsWith("reminder_")) {
      const [inv] = await db
        .select({ status: invoices.status })
        .from(invoices)
        .where(eq(invoices.id, msg.invoiceId));
      if (!inv || inv.status === "paid" || inv.status === "void") {
        await db
          .update(messages)
          .set({ status: "skipped", error: "Tagihan sudah lunas/dibatalkan" })
          .where(eq(messages.id, id));
        result.skipped++;
        continue;
      }
    }

    if (index > 0 && delayMs > 0)
      await new Promise((r) => setTimeout(r, delayMs + Math.floor(Math.random() * delayMs)));
    const res = await provider.send({ to: msg.toPhone, body: msg.body });
    if (res.ok) {
      await db
        .update(messages)
        .set({ status: "sent", sentAt: now(), providerMessageId: res.providerMessageId, error: null })
        .where(eq(messages.id, id));
      result.sent++;
    } else if (res.retryable && msg.attempts < MAX_ATTEMPTS) {
      const wait = RETRY_MINUTES[msg.attempts - 1] ?? 15;
      await db
        .update(messages)
        .set({ status: "queued", error: res.error, scheduledAt: new Date(now().getTime() + wait * 60_000) })
        .where(eq(messages.id, id));
      result.retried++;
    } else {
      await db.update(messages).set({ status: "failed", error: res.error }).where(eq(messages.id, id));
      result.failed++;
    }
  }
  return result;
}

export async function resendMessage(tx: Tx, actor: Actor, messageId: string) {
  const [msg] = await tx
    .update(messages)
    .set({ status: "queued", attempts: 0, error: null, scheduledAt: new Date() })
    .where(and(eq(messages.id, messageId), inArray(messages.status, ["failed", "skipped"])))
    .returning();
  if (!msg) throw new ServiceError("Pesan tidak bisa dikirim ulang.");
  await audit(tx, actor, {
    propertyId: msg.propertyId,
    action: "message.resend",
    entityType: "message",
    entityId: messageId,
  });
  return msg;
}

export async function listMessages(
  tx: Tx,
  propertyId: string,
  opts: { status?: "failed" | "queued"; limit?: number } = {},
) {
  const conditions = [eq(messages.propertyId, propertyId)];
  if (opts.status === "failed") conditions.push(eq(messages.status, "failed"));
  if (opts.status === "queued") conditions.push(inArray(messages.status, ["queued", "sending"]));
  return tx
    .select({
      id: messages.id,
      type: messages.type,
      status: messages.status,
      toPhone: messages.toPhone,
      body: messages.body,
      error: messages.error,
      attempts: messages.attempts,
      scheduledAt: messages.scheduledAt,
      sentAt: messages.sentAt,
      createdAt: messages.createdAt,
      tenantName: tenants.fullName,
    })
    .from(messages)
    .leftJoin(tenants, eq(tenants.id, messages.tenantId))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(opts.limit ?? 100);
}

export async function messageCounts(tx: Tx, propertyId: string) {
  const rows = await tx
    .select({ status: messages.status, count: sql<number>`count(*)`.mapWith(Number) })
    .from(messages)
    .where(eq(messages.propertyId, propertyId))
    .groupBy(messages.status)
    .orderBy(asc(messages.status));
  return Object.fromEntries(rows.map((r) => [r.status, r.count])) as Partial<Record<string, number>>;
}

/** Webhook status dari penyedia (mis. Fonnte): perbarui status pesan bila maju. */
export async function updateDeliveryStatus(db: Db, providerMessageId: string, status: DeliveryStatus) {
  const [msg] = await db
    .select({ id: messages.id, status: messages.status })
    .from(messages)
    .where(eq(messages.providerMessageId, providerMessageId));
  if (!msg || !shouldAdvance(msg.status, status)) return false;
  await db.update(messages).set({ status }).where(eq(messages.id, msg.id));
  return true;
}
