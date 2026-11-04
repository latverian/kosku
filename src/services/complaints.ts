/**
 * Komplain & perbaikan (specs/02 M7).
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import {
  attachments,
  complaints,
  complaintUpdates,
  expenses,
  leases,
  profiles,
  rooms,
  tenants,
} from "@/db/schema";
import { todayIn } from "@/lib/billing";
import { audit, must, ServiceError, type Actor } from "./core";
import { notifyComplaintNew, notifyComplaintUpdate } from "./messaging";

export type ComplaintCategory = (typeof complaints.$inferInsert)["category"];
export type ComplaintPriority = NonNullable<(typeof complaints.$inferInsert)["priority"]>;
export type ComplaintStatus = NonNullable<(typeof complaints.$inferInsert)["status"]>;

export const CATEGORY_LABEL: Record<ComplaintCategory, string> = {
  electricity: "Listrik",
  water: "Air",
  ac: "AC",
  internet: "Internet / WiFi",
  cleanliness: "Kebersihan",
  security: "Keamanan",
  facility: "Fasilitas",
  neighbor: "Tetangga / kebisingan",
  other: "Lainnya",
};
export const PRIORITY_LABEL: Record<ComplaintPriority, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  urgent: "Darurat",
};
export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: "Baru",
  in_progress: "Diproses",
  resolved: "Selesai",
  rejected: "Ditolak",
};

/** Pelapor: staf (user) atau penghuni lewat portal. */
export type Reporter =
  { kind: "staff"; actor: Actor & { type: "user" } } | { kind: "tenant"; tenantId: string };

export type NewComplaint = {
  propertyId: string;
  category: ComplaintCategory;
  title: string;
  description: string | null;
  priority: ComplaintPriority;
  /** untuk staf: kamar/penghuni opsional; penghuni: otomatis kamar aktifnya */
  roomId?: string | null;
  tenantId?: string | null;
  location?: string | null;
  photos?: { path: string; mimeType: string; sizeBytes: number }[];
};

export async function createComplaint(tx: Tx, reporter: Reporter, input: NewComplaint) {
  if (!input.title.trim()) throw new ServiceError("Judul wajib diisi.", "title");
  if ((input.photos?.length ?? 0) > 5) throw new ServiceError("Maksimal 5 foto.", "photos");

  let tenantId = input.tenantId ?? null;
  let roomId = input.roomId ?? null;
  if (reporter.kind === "tenant") {
    tenantId = reporter.tenantId;
    const [lease] = await tx
      .select({ roomId: leases.roomId })
      .from(leases)
      .where(and(eq(leases.tenantId, tenantId), eq(leases.status, "active")));
    roomId = input.location ? null : (lease?.roomId ?? null);
  }

  const [complaint] = await tx
    .insert(complaints)
    .values({
      propertyId: input.propertyId,
      tenantId,
      roomId,
      location: input.location ?? null,
      category: input.category,
      title: input.title.trim(),
      description: input.description,
      priority: input.priority,
    })
    .returning();

  if (input.photos?.length) {
    await tx.insert(attachments).values(
      input.photos.map((p) => ({
        propertyId: input.propertyId,
        entityType: "complaint",
        entityId: complaint.id,
        ...p,
      })),
    );
  }
  await tx.insert(complaintUpdates).values({
    complaintId: complaint.id,
    authorType: reporter.kind === "tenant" ? "tenant" : "staff",
    authorUserId: reporter.kind === "staff" ? reporter.actor.id : null,
    toStatus: "open",
    body: null,
  });
  await notifyComplaintNew(tx, complaint.id);
  await audit(tx, reporter.kind === "staff" ? reporter.actor : { type: "system", id: null }, {
    propertyId: input.propertyId,
    action: "complaint.create",
    entityType: "complaint",
    entityId: complaint.id,
    after: { title: complaint.title, by: reporter.kind },
  });
  return complaint;
}

/** Perbarui status/prioritas/penugasan/biaya oleh staf (FR-7.3–7.9). */
export async function updateComplaint(
  tx: Tx,
  actor: Actor & { type: "user" },
  complaintId: string,
  input: {
    status: ComplaintStatus;
    priority: ComplaintPriority;
    assigneeName: string | null;
    assigneePhone: string | null;
    cost: number | null;
    note: string | null;
  },
) {
  const before = must(
    (await tx.select().from(complaints).where(eq(complaints.id, complaintId)))[0],
    "Komplain",
  );
  if (input.cost != null && (!Number.isSafeInteger(input.cost) || input.cost < 0))
    throw new ServiceError("Biaya tidak valid.", "cost");

  const [after] = await tx
    .update(complaints)
    .set({
      status: input.status,
      priority: input.priority,
      assigneeName: input.assigneeName,
      assigneePhone: input.assigneePhone,
      cost: input.cost,
    })
    .where(eq(complaints.id, complaintId))
    .returning();

  const statusChanged = before.status !== after.status;
  if (statusChanged || input.note) {
    await tx.insert(complaintUpdates).values({
      complaintId,
      authorType: "staff",
      authorUserId: actor.id,
      fromStatus: statusChanged ? before.status : null,
      toStatus: statusChanged ? after.status : null,
      body: input.note,
    });
  }

  // Biaya perbaikan → pengeluaran (sekali, saat pertama kali selesai dengan biaya)
  if (after.status === "resolved" && after.cost && after.cost > 0) {
    const [existing] = await tx
      .select({ id: expenses.id })
      .from(expenses)
      .where(eq(expenses.complaintId, complaintId));
    if (existing) {
      await tx.update(expenses).set({ amount: after.cost }).where(eq(expenses.id, existing.id));
    } else {
      const [prop] = await tx.execute<{ timezone: string }>(
        sql`select timezone from properties where id = ${after.propertyId}`,
      );
      await tx.insert(expenses).values({
        propertyId: after.propertyId,
        category: "repair",
        amount: after.cost,
        spentOn: todayIn(prop?.timezone ?? "Asia/Jakarta"),
        description: `Perbaikan komplain #${after.number}: ${after.title}`,
        complaintId,
        createdBy: actor.id,
      });
    }
  }

  if (statusChanged) await notifyComplaintUpdate(tx, complaintId, input.note);
  await audit(tx, actor, {
    propertyId: after.propertyId,
    action: "complaint.update",
    entityType: "complaint",
    entityId: complaintId,
    before,
    after,
  });
  return after;
}

export async function addComplaintComment(tx: Tx, author: Reporter, complaintId: string, body: string) {
  if (!body.trim()) throw new ServiceError("Komentar kosong.", "body");
  const complaint = must(
    (await tx.select().from(complaints).where(eq(complaints.id, complaintId)))[0],
    "Komplain",
  );
  if (author.kind === "tenant" && complaint.tenantId !== author.tenantId)
    throw new ServiceError("Komplain tidak ditemukan.");
  await tx.insert(complaintUpdates).values({
    complaintId,
    authorType: author.kind === "tenant" ? "tenant" : "staff",
    authorUserId: author.kind === "staff" ? author.actor.id : null,
    body: body.trim(),
  });
  // Balasan staf diteruskan ke penghuni lewat WA
  if (author.kind === "staff") await notifyComplaintUpdate(tx, complaintId, body.trim());
}

export async function rateComplaint(tx: Tx, tenantId: string, complaintId: string, rating: number) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ServiceError("Rating 1–5.", "rating");
  const [row] = await tx
    .update(complaints)
    .set({ rating })
    .where(
      and(
        eq(complaints.id, complaintId),
        eq(complaints.tenantId, tenantId),
        eq(complaints.status, "resolved"),
      ),
    )
    .returning();
  if (!row) throw new ServiceError("Komplain belum selesai atau tidak ditemukan.");
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export async function listComplaints(
  tx: Tx,
  propertyId: string,
  filter: { status?: ComplaintStatus[]; tenantId?: string } = {},
) {
  const conditions = [eq(complaints.propertyId, propertyId)];
  if (filter.status?.length) conditions.push(inArray(complaints.status, filter.status));
  if (filter.tenantId) conditions.push(eq(complaints.tenantId, filter.tenantId));
  return tx
    .select({
      id: complaints.id,
      number: complaints.number,
      title: complaints.title,
      category: complaints.category,
      priority: complaints.priority,
      status: complaints.status,
      createdAt: complaints.createdAt,
      resolvedAt: complaints.resolvedAt,
      assigneeName: complaints.assigneeName,
      rating: complaints.rating,
      roomCode: rooms.code,
      location: complaints.location,
      tenantName: tenants.fullName,
      photos:
        sql<number>`(select count(*) from ${attachments} a where a.entity_type = 'complaint' and a.entity_id = ${complaints.id})`.mapWith(
          Number,
        ),
    })
    .from(complaints)
    .leftJoin(rooms, eq(rooms.id, complaints.roomId))
    .leftJoin(tenants, eq(tenants.id, complaints.tenantId))
    .where(and(...conditions))
    .orderBy(
      sql`case ${complaints.status} when 'open' then 0 when 'in_progress' then 1 else 2 end`,
      sql`case ${complaints.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`,
      desc(complaints.createdAt),
    )
    .limit(200);
}

export async function getComplaintDetail(tx: Tx, complaintId: string) {
  const [row] = await tx
    .select({
      complaint: complaints,
      roomCode: rooms.code,
      tenantName: tenants.fullName,
      tenantPhone: tenants.phone,
    })
    .from(complaints)
    .leftJoin(rooms, eq(rooms.id, complaints.roomId))
    .leftJoin(tenants, eq(tenants.id, complaints.tenantId))
    .where(eq(complaints.id, complaintId));
  if (!row) return null;
  const updates = await tx
    .select({ update: complaintUpdates, authorName: profiles.fullName })
    .from(complaintUpdates)
    .leftJoin(profiles, eq(profiles.id, complaintUpdates.authorUserId))
    .where(eq(complaintUpdates.complaintId, complaintId))
    .orderBy(asc(complaintUpdates.createdAt));
  const photos = await tx
    .select()
    .from(attachments)
    .where(and(eq(attachments.entityType, "complaint"), eq(attachments.entityId, complaintId)))
    .orderBy(asc(attachments.createdAt));
  return { ...row, updates, photos };
}
