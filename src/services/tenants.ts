/**
 * Penghuni & sewa: check-in, check-out, pindah kamar (specs/02 M2).
 */
import { and, asc, desc, eq, exists, gte, ilike, inArray, isNull, not, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { invoices, leases, payments, rooms, tenants } from "@/db/schema";
import { addMonths, assertBillingDay, type IsoDate } from "@/lib/billing";
import { encryptText } from "@/lib/crypto";
import { creditBalance, generateInvoicesForLease, releaseCreditPayments } from "./billing";
import { audit, must, ServiceError, type Actor } from "./core";
import { notifyWelcome } from "./messaging";

export type TenantInput = {
  fullName: string;
  phone: string; // sudah dinormalisasi 62…
  email: string | null;
  nik: string | null; // polos; disimpan terenkripsi
  occupation: string | null;
  emergencyName: string | null;
  emergencyRelation: string | null;
  emergencyPhone: string | null;
  notes: string | null;
};

export type LeaseInput = {
  startDate: IsoDate;
  endDate: IsoDate | null;
  monthlyRent: number;
  billingDay: number;
  depositAmount: number;
  billingStartPeriod: IsoDate | null;
};

function nikColumns(nik: string | null, nikKey: string | null | undefined) {
  if (!nik) return {};
  const digits = nik.replace(/\D/g, "");
  if (digits.length !== 16) throw new ServiceError("NIK harus 16 digit.", "nik");
  if (!nikKey) {
    throw new ServiceError(
      "NIK belum bisa disimpan karena NIK_ENCRYPTION_KEY belum diatur. Kosongkan NIK dulu.",
      "nik",
    );
  }
  return { nikEncrypted: encryptText(digits, nikKey), nikLast4: digits.slice(-4) };
}

function tenantColumns(input: TenantInput, nikKey: string | null | undefined) {
  const { nik, ...rest } = input;
  return { ...rest, ...nikColumns(nik, nikKey) };
}

function validateLease(input: LeaseInput) {
  assertBillingDay(input.billingDay);
  if (!Number.isSafeInteger(input.monthlyRent) || input.monthlyRent < 0) {
    throw new ServiceError("Harga sewa tidak valid.", "monthlyRent");
  }
  if (!Number.isSafeInteger(input.depositAmount) || input.depositAmount < 0) {
    throw new ServiceError("Deposit tidak valid.", "depositAmount");
  }
  if (input.endDate && input.endDate < input.startDate) {
    throw new ServiceError("Tanggal selesai tidak boleh sebelum tanggal masuk.", "endDate");
  }
  if (input.billingStartPeriod && !input.billingStartPeriod.endsWith("-01")) {
    throw new ServiceError("Periode mulai tagih harus tanggal 1.", "billingStartPeriod");
  }
}

async function roomForCheckIn(tx: Tx, roomId: string) {
  const room = must((await tx.select().from(rooms).where(eq(rooms.id, roomId)))[0], "Kamar");
  if (room.archivedAt) throw new ServiceError("Kamar sudah diarsipkan.");
  if (room.status === "maintenance") throw new ServiceError("Kamar sedang dalam perbaikan.");
  return room;
}

export async function checkIn(
  tx: Tx,
  actor: Actor,
  input: {
    roomId: string;
    tenant: TenantInput;
    lease: LeaseInput;
    nikKey?: string | null;
    today?: IsoDate;
    /** kirim WA sambutan + link portal (default ya) */
    sendWelcome?: boolean;
  },
) {
  validateLease(input.lease);
  const room = await roomForCheckIn(tx, input.roomId);

  const [tenant] = await tx
    .insert(tenants)
    .values({ propertyId: room.propertyId, ...tenantColumns(input.tenant, input.nikKey) })
    .returning();

  const [lease] = await tx
    .insert(leases)
    .values({ propertyId: room.propertyId, roomId: room.id, tenantId: tenant.id, ...input.lease })
    .returning();

  const created = await generateInvoicesForLease(tx, actor, lease.id, input.today);
  if (input.sendWelcome !== false) await notifyWelcome(tx, lease.id);
  await audit(tx, actor, {
    propertyId: room.propertyId,
    action: "lease.check_in",
    entityType: "lease",
    entityId: lease.id,
    after: { tenant: tenant.fullName, room: room.code, ...input.lease },
  });
  return { tenant, lease, invoices: created };
}

export async function updateTenant(
  tx: Tx,
  actor: Actor,
  tenantId: string,
  input: TenantInput,
  nikKey?: string | null,
) {
  const before = must((await tx.select().from(tenants).where(eq(tenants.id, tenantId)))[0], "Penghuni");
  const [after] = await tx
    .update(tenants)
    .set(tenantColumns(input, nikKey))
    .where(eq(tenants.id, tenantId))
    .returning();
  // Jangan simpan NIK terenkripsi di audit log.
  const redact = <T extends { nikEncrypted: string | null }>(t: T) => ({
    ...t,
    nikEncrypted: t.nikEncrypted ? "***" : null,
  });
  await audit(tx, actor, {
    propertyId: before.propertyId,
    action: "tenant.update",
    entityType: "tenant",
    entityId: tenantId,
    before: redact(before),
    after: redact(after),
  });
  return after;
}

/**
 * Batalkan tagihan yang belum punya pembayaran sama sekali dan jatuh tempo
 * pada/setelah tanggal keluar (tagihan yang terlanjur dibuat di muka).
 */
async function voidFutureInvoices(tx: Tx, leaseId: string, fromDate: IsoDate, reason: string) {
  // Hanya pembayaran sungguhan yang menahan pembatalan; potongan saldo kredit dikembalikan.
  const hasRealPayment = exists(
    tx
      .select({ one: sql`1` })
      .from(payments)
      .where(
        and(
          eq(payments.invoiceId, invoices.id),
          inArray(payments.status, ["verified", "pending"]),
          sql`${payments.method} <> 'credit'`,
        ),
      ),
  );
  const candidates = await tx
    .select({ id: invoices.id, number: invoices.number })
    .from(invoices)
    .where(
      and(
        eq(invoices.leaseId, leaseId),
        inArray(invoices.status, ["issued", "partial", "paid", "draft"]),
        gte(invoices.dueDate, fromDate),
        not(hasRealPayment),
      ),
    );
  for (const inv of candidates) {
    await releaseCreditPayments(tx, inv.id, `${reason}: ${inv.number} dibatalkan`);
    await tx.update(invoices).set({ status: "void", voidReason: reason }).where(eq(invoices.id, inv.id));
  }
  return candidates;
}

async function activeLeaseOrThrow(tx: Tx, leaseId: string) {
  const lease = must((await tx.select().from(leases).where(eq(leases.id, leaseId)))[0], "Sewa");
  if (lease.status !== "active") throw new ServiceError("Sewa ini sudah selesai.");
  return lease;
}

export async function checkOut(
  tx: Tx,
  actor: Actor,
  input: {
    leaseId: string;
    endDate: IsoDate;
    reason: string | null;
    depositStatus: "refunded" | "partial_refund" | "forfeited" | "held";
    depositRefunded: number;
  },
) {
  const lease = await activeLeaseOrThrow(tx, input.leaseId);
  if (input.endDate < lease.startDate)
    throw new ServiceError("Tanggal keluar tidak boleh sebelum tanggal masuk.", "endDate");
  const refunded =
    input.depositStatus === "refunded"
      ? lease.depositAmount
      : input.depositStatus === "partial_refund"
        ? input.depositRefunded
        : 0;
  if (!Number.isSafeInteger(refunded) || refunded < 0 || refunded > lease.depositAmount) {
    throw new ServiceError("Nominal deposit yang dikembalikan tidak valid.", "depositRefunded");
  }

  const [after] = await tx
    .update(leases)
    .set({
      status: "ended",
      endDate: input.endDate,
      endedReason: input.reason,
      depositStatus: input.depositStatus,
      depositRefunded: refunded,
    })
    .where(eq(leases.id, lease.id))
    .returning();
  const voided = await voidFutureInvoices(tx, lease.id, input.endDate, "Check-out");

  await audit(tx, actor, {
    propertyId: lease.propertyId,
    action: "lease.check_out",
    entityType: "lease",
    entityId: lease.id,
    before: lease,
    after: { ...after, voidedInvoices: voided.map((v) => v.number) },
  });
  return { lease: after, voided };
}

/** Pindah kamar = selesaikan sewa lama + sewa baru di kamar lain (FR-2.6). */
export async function moveRoom(
  tx: Tx,
  actor: Actor,
  input: { leaseId: string; newRoomId: string; moveDate: IsoDate; monthlyRent: number; today?: IsoDate },
) {
  const old = await activeLeaseOrThrow(tx, input.leaseId);
  if (old.roomId === input.newRoomId) throw new ServiceError("Pilih kamar yang berbeda.", "newRoomId");
  if (input.moveDate < old.startDate)
    throw new ServiceError("Tanggal pindah tidak boleh sebelum tanggal masuk.", "moveDate");
  const newRoom = await roomForCheckIn(tx, input.newRoomId);
  if (newRoom.propertyId !== old.propertyId) throw new ServiceError("Kamar tujuan ada di kos lain.");

  // Tagihan sewa lama yang siklusnya memuat tanggal pindah tetap berlaku;
  // sewa baru mulai ditagih dari siklus berikutnya.
  const [covering] = await tx
    .select({ period: invoices.period })
    .from(invoices)
    .where(
      and(
        eq(invoices.leaseId, old.id),
        not(eq(invoices.status, "void")),
        sql`${invoices.coversFrom} <= ${input.moveDate}::date`,
        sql`${input.moveDate}::date < ${invoices.coversTo}`,
      ),
    );

  const [oldRoom] = await tx.select({ code: rooms.code }).from(rooms).where(eq(rooms.id, old.roomId));
  await tx
    .update(leases)
    .set({
      status: "ended",
      endDate: input.moveDate,
      endedReason: `Pindah ke kamar ${newRoom.code}`,
      depositStatus: "transferred",
    })
    .where(eq(leases.id, old.id));
  const voided = await voidFutureInvoices(tx, old.id, input.moveDate, `Pindah ke kamar ${newRoom.code}`);

  const [lease] = await tx
    .insert(leases)
    .values({
      propertyId: old.propertyId,
      roomId: newRoom.id,
      tenantId: old.tenantId,
      startDate: input.moveDate,
      monthlyRent: input.monthlyRent,
      billingDay: old.billingDay,
      depositAmount: old.depositAmount,
      billingStartPeriod: covering ? addMonths(covering.period, 1) : null,
    })
    .returning();
  const created = await generateInvoicesForLease(tx, actor, lease.id, input.today);

  await audit(tx, actor, {
    propertyId: old.propertyId,
    action: "lease.move",
    entityType: "lease",
    entityId: lease.id,
    before: { leaseId: old.id, room: oldRoom?.code },
    after: { leaseId: lease.id, room: newRoom.code, voided: voided.map((v) => v.number) },
  });
  return { lease, voided, invoices: created };
}

// ---------------------------------------------------------------------------
// Query untuk halaman
// ---------------------------------------------------------------------------

export async function listTenants(tx: Tx, propertyId: string, opts: { active: boolean; q?: string }) {
  const activeLease = exists(
    tx
      .select({ one: sql`1` })
      .from(leases)
      .where(and(eq(leases.tenantId, tenants.id), eq(leases.status, "active"))),
  );
  const conditions = [
    eq(tenants.propertyId, propertyId),
    isNull(tenants.archivedAt),
    opts.active ? activeLease : not(activeLease),
  ];
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    conditions.push(or(ilike(tenants.fullName, q), ilike(tenants.phone, q))!);
  }
  return tx
    .select({
      id: tenants.id,
      fullName: tenants.fullName,
      phone: tenants.phone,
      occupation: tenants.occupation,
      roomCode: rooms.code,
      startDate: leases.startDate,
      billingDay: leases.billingDay,
      monthlyRent: leases.monthlyRent,
    })
    .from(tenants)
    .leftJoin(leases, and(eq(leases.tenantId, tenants.id), eq(leases.status, "active")))
    .leftJoin(rooms, eq(rooms.id, leases.roomId))
    .where(and(...conditions))
    .orderBy(asc(rooms.code), asc(tenants.fullName));
}

export async function getTenantDetail(tx: Tx, tenantId: string) {
  const tenant = (await tx.select().from(tenants).where(eq(tenants.id, tenantId)))[0];
  if (!tenant) return null;
  const leaseRows = await tx
    .select({ lease: leases, roomCode: rooms.code })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .where(eq(leases.tenantId, tenantId))
    .orderBy(desc(leases.startDate));
  const invoiceRows = await tx
    .select()
    .from(invoices)
    .where(eq(invoices.tenantId, tenantId))
    .orderBy(desc(invoices.dueDate))
    .limit(24);
  return {
    tenant,
    leases: leaseRows,
    activeLease: leaseRows.find((l) => l.lease.status === "active") ?? null,
    invoices: invoiceRows,
    credit: await creditBalance(tx, tenantId),
  };
}

/** Kamar yang bisa ditempati (untuk check-in & pindah kamar). */
export async function listAvailableRooms(tx: Tx, propertyId: string) {
  const activeCount =
    sql<number>`(select count(*) from ${leases} l where l.room_id = ${rooms.id} and l.status = 'active')`.mapWith(
      Number,
    );
  const rows = await tx
    .select({
      id: rooms.id,
      code: rooms.code,
      floor: rooms.floor,
      type: rooms.type,
      monthlyPrice: rooms.monthlyPrice,
      depositAmount: rooms.depositAmount,
      capacity: rooms.capacity,
      status: rooms.status,
      active: activeCount,
    })
    .from(rooms)
    .where(
      and(eq(rooms.propertyId, propertyId), isNull(rooms.archivedAt), not(eq(rooms.status, "maintenance"))),
    )
    .orderBy(asc(rooms.floor), asc(rooms.code));
  return rows.filter((r) => r.active < r.capacity);
}

export async function setRemindersMuted(tx: Tx, actor: Actor, tenantId: string, muted: boolean) {
  const [row] = await tx
    .update(tenants)
    .set({ remindersMuted: muted })
    .where(eq(tenants.id, tenantId))
    .returning();
  must(row, "Penghuni");
  await audit(tx, actor, {
    propertyId: row.propertyId,
    action: muted ? "tenant.mute" : "tenant.unmute",
    entityType: "tenant",
    entityId: tenantId,
  });
}

export async function setIdCard(tx: Tx, actor: Actor, tenantId: string, path: string | null) {
  const [row] = await tx
    .update(tenants)
    .set({ idCardPath: path })
    .where(eq(tenants.id, tenantId))
    .returning();
  must(row, "Penghuni");
  await audit(tx, actor, {
    propertyId: row.propertyId,
    action: path ? "tenant.id_card" : "tenant.id_card_remove",
    entityType: "tenant",
    entityId: tenantId,
  });
}
