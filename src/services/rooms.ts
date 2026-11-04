import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { invoices, leases, rooms, tenants } from "@/db/schema";
import { audit, must, ServiceError, type Actor } from "./core";

export type RoomInput = {
  code: string;
  floor: number | null;
  type: string | null;
  capacity: number;
  monthlyPrice: number;
  depositAmount: number;
  facilities: string[];
  notes: string | null;
};

export const ROOM_UNIQUE_MESSAGES = { rooms_property_code_uq: "Kode kamar sudah dipakai di kos ini." };

/** Tambah satu atau banyak kamar sekaligus (FR-1.2, tambah massal). */
export async function createRooms(tx: Tx, actor: Actor, propertyId: string, inputs: RoomInput[]) {
  if (inputs.length === 0) throw new ServiceError("Tidak ada kamar untuk ditambahkan.");
  const codes = inputs.map((r) => r.code.trim());
  if (new Set(codes).size !== codes.length) throw new ServiceError("Ada kode kamar yang sama di daftar.");
  const rows = await tx
    .insert(rooms)
    .values(inputs.map((r) => ({ ...r, code: r.code.trim(), propertyId })))
    .returning();
  await audit(tx, actor, {
    propertyId,
    action: rows.length > 1 ? "room.create_bulk" : "room.create",
    entityType: "room",
    entityId: rows.length === 1 ? rows[0].id : null,
    after: rows.map((r) => ({ id: r.id, code: r.code })),
  });
  return rows;
}

/** "01".."04" dari awal & jumlah, mempertahankan lebar angka awal. */
export function sequenceCodes(prefix: string, start: number, count: number, width: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(width, "0")}`);
}

export async function updateRoom(
  tx: Tx,
  actor: Actor,
  roomId: string,
  input: RoomInput & { status?: "vacant" | "reserved" | "maintenance" },
) {
  const before = must((await tx.select().from(rooms).where(eq(rooms.id, roomId)))[0], "Kamar");
  const { status, ...rest } = input;
  const [after] = await tx
    .update(rooms)
    .set({
      ...rest,
      code: rest.code.trim(),
      // status "occupied" diatur sistem dari sewa aktif; hanya ubah bila diminta
      ...(status && before.status !== "occupied" ? { status } : {}),
    })
    .where(eq(rooms.id, roomId))
    .returning();
  await audit(tx, actor, {
    propertyId: before.propertyId,
    action: "room.update",
    entityType: "room",
    entityId: roomId,
    before,
    after,
  });
  return after;
}

export async function archiveRoom(tx: Tx, actor: Actor, roomId: string) {
  const room = must((await tx.select().from(rooms).where(eq(rooms.id, roomId)))[0], "Kamar");
  const active = await tx
    .select({ id: leases.id })
    .from(leases)
    .where(and(eq(leases.roomId, roomId), eq(leases.status, "active")));
  if (active.length > 0)
    throw new ServiceError("Kamar masih punya penghuni aktif. Lakukan check-out terlebih dahulu.");
  await tx.update(rooms).set({ archivedAt: new Date() }).where(eq(rooms.id, roomId));
  await audit(tx, actor, {
    propertyId: room.propertyId,
    action: "room.archive",
    entityType: "room",
    entityId: roomId,
    before: room,
  });
}

export async function listRooms(tx: Tx, propertyId: string) {
  return tx
    .select({
      id: rooms.id,
      code: rooms.code,
      floor: rooms.floor,
      type: rooms.type,
      capacity: rooms.capacity,
      monthlyPrice: rooms.monthlyPrice,
      status: rooms.status,
      facilities: rooms.facilities,
      tenantId: tenants.id,
      tenantName: tenants.fullName,
      leaseId: leases.id,
    })
    .from(rooms)
    .leftJoin(leases, and(eq(leases.roomId, rooms.id), eq(leases.status, "active")))
    .leftJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(eq(rooms.propertyId, propertyId), isNull(rooms.archivedAt)))
    .orderBy(asc(rooms.floor), asc(rooms.code));
}

export async function getRoomDetail(tx: Tx, roomId: string) {
  const room = (await tx.select().from(rooms).where(eq(rooms.id, roomId)))[0];
  if (!room) return null;
  const history = await tx
    .select({
      leaseId: leases.id,
      status: leases.status,
      startDate: leases.startDate,
      endDate: leases.endDate,
      monthlyRent: leases.monthlyRent,
      tenantId: tenants.id,
      tenantName: tenants.fullName,
      phone: tenants.phone,
    })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(eq(leases.roomId, roomId))
    .orderBy(desc(leases.startDate));
  const roomInvoices = await tx
    .select()
    .from(invoices)
    .where(eq(invoices.roomId, roomId))
    .orderBy(desc(invoices.period))
    .limit(12);
  return { room, history, invoices: roomInvoices };
}
