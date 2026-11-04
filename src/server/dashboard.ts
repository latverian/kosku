import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { and, asc, count, desc, eq, inArray, isNull, lt, or, sql, sum } from "drizzle-orm";
import { asUser, schema as s } from "@/db";
import { displayStatus, periodOf, todayIn, daysBetween, type IsoDate } from "@/lib/billing";
import type { BadgeStatus } from "@/components/ui/status-badge";

export type ActiveProperty = { id: string; name: string; code: string; timezone: string };

export const ACTIVE_PROPERTY_COOKIE = "kosku_property";

/** Semua properti yang bisa diakses user (RLS), urut dibuat. */
export const listMyProperties = cache(async (userId: string): Promise<ActiveProperty[]> =>
  asUser(userId, (tx) =>
    tx
      .select({
        id: s.properties.id,
        name: s.properties.name,
        code: s.properties.code,
        timezone: s.properties.timezone,
      })
      .from(s.properties)
      .where(isNull(s.properties.archivedAt))
      .orderBy(asc(s.properties.createdAt)),
  ),
);

/**
 * Properti aktif: pilihan terakhir user (cookie) bila masih punya akses,
 * selain itu properti pertama.
 */
export const getActiveProperty = cache(async (userId: string): Promise<ActiveProperty | null> => {
  const list = await listMyProperties(userId);
  const chosen = (await cookies()).get(ACTIVE_PROPERTY_COOKIE)?.value;
  return list.find((p) => p.id === chosen) ?? list[0] ?? null;
});

export type DashboardData = {
  today: IsoDate;
  period: IsoDate;
  billed: number;
  received: number;
  unpaidAmount: number;
  unpaidCount: number;
  overdueAmount: number;
  overdueCount: number;
  roomsTotal: number;
  roomsOccupied: number;
  pendingPayments: {
    id: string;
    amount: number;
    tenantName: string;
    roomCode: string;
    invoiceTotal: number;
    submittedAt: Date;
  }[];
  overdueInvoices: {
    id: string;
    tenantName: string;
    phone: string;
    roomCode: string;
    daysLate: number;
    remaining: number;
  }[];
  complaints: {
    id: string;
    number: number;
    title: string;
    priority: string;
    status: string;
    place: string;
  }[];
  failedMessages: number;
  rooms: {
    id: string;
    code: string;
    floor: number | null;
    roomStatus: string;
    tenantName: string | null;
    status: BadgeStatus | "vacant" | "maintenance";
    total: number | null;
    dueDate: IsoDate | null;
  }[];
};

const OPEN_INVOICE = ["issued", "partial"] as const;

function roomDisplayStatus(
  r: {
    roomStatus: string;
    tenantName: string | null;
    invoiceStatus: "draft" | "issued" | "partial" | "paid" | "void" | null;
    dueDate: IsoDate | null;
    hasPending: boolean;
    oldestOverdueDue: string | null;
    olderPending: boolean;
  },
  today: IsoDate,
): DashboardData["rooms"][number]["status"] {
  if (r.roomStatus === "maintenance") return "maintenance";
  if (!r.tenantName) return "vacant";
  if (r.oldestOverdueDue) {
    // Ada tunggakan: tampil "menunggu verifikasi" bila bukti sudah dikirim, selain itu "terlambat".
    return r.olderPending ? "pending" : "overdue";
  }
  if (r.invoiceStatus && r.dueDate) {
    return displayStatus(
      { status: r.invoiceStatus, dueDate: r.dueDate, hasPendingPayment: r.hasPending },
      today,
    );
  }
  return "none";
}

export async function getDashboard(userId: string, property: ActiveProperty): Promise<DashboardData> {
  const today = todayIn(property.timezone);
  const period = periodOf(today);
  const pid = property.id;

  return asUser(userId, async (tx) => {
    const [periodTotals] = await tx
      .select({
        billed: sum(s.invoices.total).mapWith(Number),
        received: sum(s.invoices.paidAmount).mapWith(Number),
        unpaidCount:
          sql<number>`count(*) filter (where ${s.invoices.status} in ('issued','partial'))`.mapWith(Number),
      })
      .from(s.invoices)
      .where(
        and(
          eq(s.invoices.propertyId, pid),
          eq(s.invoices.period, period),
          inArray(s.invoices.status, ["issued", "partial", "paid"]),
        ),
      );

    const [overdueTotals] = await tx
      .select({
        amount: sql<number>`coalesce(sum(${s.invoices.total} - ${s.invoices.paidAmount}), 0)`.mapWith(Number),
        count: count(),
      })
      .from(s.invoices)
      .where(
        and(
          eq(s.invoices.propertyId, pid),
          inArray(s.invoices.status, OPEN_INVOICE),
          lt(s.invoices.dueDate, today),
        ),
      );

    const [roomTotals] = await tx
      .select({
        total: count(),
        occupied: sql<number>`count(*) filter (where ${s.rooms.status} = 'occupied')`.mapWith(Number),
      })
      .from(s.rooms)
      .where(and(eq(s.rooms.propertyId, pid), isNull(s.rooms.archivedAt)));

    const pendingPayments = await tx
      .select({
        id: s.payments.id,
        amount: s.payments.amount,
        tenantName: s.tenants.fullName,
        roomCode: s.rooms.code,
        invoiceTotal: s.invoices.total,
        submittedAt: s.payments.createdAt,
      })
      .from(s.payments)
      .innerJoin(s.invoices, eq(s.invoices.id, s.payments.invoiceId))
      .innerJoin(s.tenants, eq(s.tenants.id, s.payments.tenantId))
      .innerJoin(s.rooms, eq(s.rooms.id, s.invoices.roomId))
      .where(and(eq(s.payments.propertyId, pid), eq(s.payments.status, "pending")))
      .orderBy(asc(s.payments.createdAt))
      .limit(10);

    const overdueRows = await tx
      .select({
        id: s.invoices.id,
        tenantName: s.tenants.fullName,
        phone: s.tenants.phone,
        roomCode: s.rooms.code,
        dueDate: s.invoices.dueDate,
        total: s.invoices.total,
        paid: s.invoices.paidAmount,
      })
      .from(s.invoices)
      .innerJoin(s.tenants, eq(s.tenants.id, s.invoices.tenantId))
      .innerJoin(s.rooms, eq(s.rooms.id, s.invoices.roomId))
      .where(
        and(
          eq(s.invoices.propertyId, pid),
          inArray(s.invoices.status, OPEN_INVOICE),
          lt(s.invoices.dueDate, today),
        ),
      )
      .orderBy(asc(s.invoices.dueDate))
      .limit(10);

    const complaintRows = await tx
      .select({
        id: s.complaints.id,
        number: s.complaints.number,
        title: s.complaints.title,
        priority: s.complaints.priority,
        status: s.complaints.status,
        roomCode: s.rooms.code,
        location: s.complaints.location,
      })
      .from(s.complaints)
      .leftJoin(s.rooms, eq(s.rooms.id, s.complaints.roomId))
      .where(
        and(
          eq(s.complaints.propertyId, pid),
          or(
            eq(s.complaints.status, "open"),
            and(eq(s.complaints.status, "in_progress"), inArray(s.complaints.priority, ["high", "urgent"])),
          ),
        ),
      )
      .orderBy(
        sql`case ${s.complaints.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`,
        desc(s.complaints.createdAt),
      )
      .limit(5);

    const [failed] = await tx
      .select({ count: count() })
      .from(s.messages)
      .where(and(eq(s.messages.propertyId, pid), eq(s.messages.status, "failed")));

    // Kisi kamar: sewa aktif + tagihan periode ini + ada bukti menunggu?
    const roomRows = await tx
      .select({
        id: s.rooms.id,
        code: s.rooms.code,
        floor: s.rooms.floor,
        roomStatus: s.rooms.status,
        tenantName: s.tenants.fullName,
        invoiceStatus: s.invoices.status,
        total: s.invoices.total,
        dueDate: s.invoices.dueDate,
        hasPending: sql<boolean>`exists (select 1 from ${s.payments} p where p.invoice_id = ${s.invoices.id} and p.status = 'pending')`,
        // Tunggakan periode sebelumnya tetap membuat kamar tampil "Terlambat".
        oldestOverdueDue: sql<
          string | null
        >`(select min(o.due_date)::text from ${s.invoices} o where o.lease_id = ${s.leases.id} and o.status in ('issued','partial') and o.due_date < ${today}::date)`,
        olderPending: sql<boolean>`exists (select 1 from ${s.payments} p join ${s.invoices} o on o.id = p.invoice_id where o.lease_id = ${s.leases.id} and p.status = 'pending')`,
      })
      .from(s.rooms)
      .leftJoin(s.leases, and(eq(s.leases.roomId, s.rooms.id), eq(s.leases.status, "active")))
      .leftJoin(s.tenants, eq(s.tenants.id, s.leases.tenantId))
      .leftJoin(s.invoices, and(eq(s.invoices.leaseId, s.leases.id), eq(s.invoices.period, period)))
      .where(and(eq(s.rooms.propertyId, pid), isNull(s.rooms.archivedAt)))
      .orderBy(asc(s.rooms.floor), asc(s.rooms.code));

    return {
      today,
      period,
      billed: periodTotals?.billed ?? 0,
      received: periodTotals?.received ?? 0,
      unpaidAmount: Math.max(0, (periodTotals?.billed ?? 0) - (periodTotals?.received ?? 0)),
      unpaidCount: periodTotals?.unpaidCount ?? 0,
      overdueAmount: overdueTotals?.amount ?? 0,
      overdueCount: overdueTotals?.count ?? 0,
      roomsTotal: roomTotals?.total ?? 0,
      roomsOccupied: roomTotals?.occupied ?? 0,
      pendingPayments,
      overdueInvoices: overdueRows.map((r) => ({
        id: r.id,
        tenantName: r.tenantName,
        phone: r.phone,
        roomCode: r.roomCode,
        daysLate: daysBetween(r.dueDate, today),
        remaining: r.total - r.paid,
      })),
      complaints: complaintRows.map((c) => ({
        id: c.id,
        number: c.number,
        title: c.title,
        priority: c.priority,
        status: c.status,
        place: c.roomCode ? `Kamar ${c.roomCode}` : (c.location ?? "Area umum"),
      })),
      failedMessages: failed?.count ?? 0,
      rooms: roomRows.map((r) => ({
        id: r.id,
        code: r.code,
        floor: r.floor,
        roomStatus: r.roomStatus,
        tenantName: r.tenantName,
        total: r.total,
        dueDate: r.dueDate,
        status: roomDisplayStatus(r, today),
      })),
    };
  });
}

export type JobHealth = {
  failed: { job: string; error: string | null; at: Date } | null;
  lastSuccessAt: Date | null;
  /** production saja: job harian belum sukses > 26 jam */
  stale: boolean;
};

/** Kesehatan job otomatis (NFR-9): job terakhir gagal, atau lama tidak jalan. */
export async function getJobHealth(userId: string, propertyId: string): Promise<JobHealth> {
  return asUser(userId, async (tx) => {
    const latest = await tx
      .select({
        job: s.jobRuns.job,
        status: s.jobRuns.status,
        error: s.jobRuns.error,
        startedAt: s.jobRuns.startedAt,
      })
      .from(s.jobRuns)
      .where(
        and(
          eq(s.jobRuns.propertyId, propertyId),
          inArray(s.jobRuns.job, ["generate_invoices", "apply_late_fees", "schedule_reminders"]),
        ),
      )
      .orderBy(desc(s.jobRuns.startedAt))
      .limit(3);
    const failed = latest.find((r) => r.status === "failed");
    const [success] = await tx
      .select({ at: s.jobRuns.startedAt })
      .from(s.jobRuns)
      .where(
        and(
          eq(s.jobRuns.propertyId, propertyId),
          eq(s.jobRuns.job, "generate_invoices"),
          eq(s.jobRuns.status, "success"),
        ),
      )
      .orderBy(desc(s.jobRuns.startedAt))
      .limit(1);
    return {
      failed: failed ? { job: failed.job, error: failed.error, at: failed.startedAt } : null,
      lastSuccessAt: success?.at ?? null,
      stale:
        process.env.NODE_ENV === "production" &&
        (!success || Date.now() - success.at.getTime() > 26 * 60 * 60 * 1000),
    };
  });
}
