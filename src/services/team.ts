/**
 * Tim pengelola per properti (FR-10.2, FR-10.3).
 * Pengelola harus mendaftar akun dulu (halaman /daftar), lalu pemilik
 * menambahkannya dengan email.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { profiles, propertyMembers } from "@/db/schema";
import { audit, ServiceError, type Actor } from "./core";

/** Cari user berdasarkan email — butuh koneksi admin (skema auth). */
export async function findUserIdByEmail(adminTx: Tx, email: string): Promise<string | null> {
  const rows = await adminTx.execute<{ id: string }>(
    sql`select id from auth.users where lower(email) = lower(${email.trim()}) limit 1`,
  );
  return rows[0]?.id ?? null;
}

export async function userEmails(adminTx: Tx, userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await adminTx.execute<{ id: string; email: string | null }>(
    sql`select id, email from auth.users where id in (${sql.join(
      userIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`,
  );
  return new Map(rows.map((r) => [r.id, r.email ?? ""]));
}

export async function listMembers(tx: Tx, propertyId: string) {
  return tx
    .select({
      userId: propertyMembers.userId,
      role: propertyMembers.role,
      canViewFinance: propertyMembers.canViewFinance,
      name: profiles.fullName,
      phone: profiles.phone,
      since: propertyMembers.createdAt,
    })
    .from(propertyMembers)
    .innerJoin(profiles, eq(profiles.id, propertyMembers.userId))
    .where(eq(propertyMembers.propertyId, propertyId))
    .orderBy(asc(propertyMembers.createdAt));
}

/** Tambah pengelola (RLS: hanya owner yang bisa). */
export async function addManager(
  tx: Tx,
  actor: Actor & { type: "user" },
  propertyId: string,
  userId: string | null,
  canViewFinance: boolean,
) {
  if (!userId)
    throw new ServiceError(
      "Email belum terdaftar. Minta pengelola membuat akun di halaman Daftar dulu.",
      "email",
    );
  if (userId === actor.id) throw new ServiceError("Itu akun kamu sendiri.", "email");
  const [row] = await tx
    .insert(propertyMembers)
    .values({ propertyId, userId, role: "manager", canViewFinance })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new ServiceError("User ini sudah menjadi anggota tim.", "email");
  await audit(tx, actor, {
    propertyId,
    action: "member.add",
    entityType: "member",
    entityId: userId,
    after: { canViewFinance },
  });
  return row;
}

export async function setFinanceAccess(
  tx: Tx,
  actor: Actor,
  propertyId: string,
  userId: string,
  canViewFinance: boolean,
) {
  const [row] = await tx
    .update(propertyMembers)
    .set({ canViewFinance })
    .where(
      and(
        eq(propertyMembers.propertyId, propertyId),
        eq(propertyMembers.userId, userId),
        eq(propertyMembers.role, "manager"),
      ),
    )
    .returning();
  if (!row) throw new ServiceError("Hanya pemilik yang bisa mengubah izin pengelola.");
  await audit(tx, actor, {
    propertyId,
    action: "member.finance",
    entityType: "member",
    entityId: userId,
    after: { canViewFinance },
  });
}

export async function removeMember(
  tx: Tx,
  actor: Actor & { type: "user" },
  propertyId: string,
  userId: string,
) {
  if (userId === actor.id) throw new ServiceError("Kamu tidak bisa menghapus diri sendiri.");
  const [row] = await tx
    .delete(propertyMembers)
    .where(
      and(
        eq(propertyMembers.propertyId, propertyId),
        eq(propertyMembers.userId, userId),
        eq(propertyMembers.role, "manager"),
      ),
    )
    .returning();
  if (!row) throw new ServiceError("Anggota tidak ditemukan atau kamu bukan pemilik.");
  await audit(tx, actor, { propertyId, action: "member.remove", entityType: "member", entityId: userId });
}
