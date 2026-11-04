import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withUser } from "@/db/client";
import { connect, createAuthUser, s, uniqueCode } from "./helpers";

const { db, client } = connect();

let ownerId: string;
let strangerId: string;
let propertyId: string;
let roomId: string;
let tenantId: string;
let leaseId: string;

beforeAll(async () => {
  ownerId = await createAuthUser(db, `owner-${uniqueCode()}@test.local`);
  strangerId = await createAuthUser(db, `other-${uniqueCode()}@test.local`);

  // Properti dibuat sebagai owner → trigger menjadikan dia owner + membuat pengaturan.
  propertyId = await withUser(db, ownerId, async (tx) => {
    const [p] = await tx
      .insert(s.properties)
      .values({ code: uniqueCode(), name: "Kos Uji" })
      .returning({ id: s.properties.id });
    return p.id;
  });

  await withUser(db, ownerId, async (tx) => {
    const [room] = await tx
      .insert(s.rooms)
      .values({ propertyId, code: "01", monthlyPrice: 1_500_000 })
      .returning({ id: s.rooms.id });
    roomId = room.id;
    const [tenant] = await tx
      .insert(s.tenants)
      .values({ propertyId, fullName: "Penghuni Uji", phone: "6281234567890" })
      .returning({ id: s.tenants.id });
    tenantId = tenant.id;
  });
});

afterAll(async () => {
  await client.end();
});

describe("trigger", () => {
  it("profil dibuat otomatis untuk user baru", async () => {
    const rows = await db.select().from(s.profiles).where(eq(s.profiles.id, ownerId));
    expect(rows).toHaveLength(1);
  });

  it("properti baru → pembuat jadi owner & pengaturan default dibuat", async () => {
    const members = await db
      .select()
      .from(s.propertyMembers)
      .where(eq(s.propertyMembers.propertyId, propertyId));
    expect(members).toMatchObject([{ userId: ownerId, role: "owner", canViewFinance: true }]);

    const [settings] = await db
      .select()
      .from(s.propertySettings)
      .where(eq(s.propertySettings.propertyId, propertyId));
    expect(settings.reminderOffsets).toEqual([-3, 0, 1, 3, 7]);
    expect(settings.invoiceLeadDays).toBe(7);
  });

  it("check-in membuat kamar terisi, dan kamar penuh menolak sewa kedua", async () => {
    const [lease] = await db
      .insert(s.leases)
      .values({
        propertyId,
        roomId,
        tenantId,
        startDate: "2026-11-05",
        monthlyRent: 1_500_000,
        billingDay: 5,
      })
      .returning({ id: s.leases.id });
    leaseId = lease.id;

    const [room] = await db.select().from(s.rooms).where(eq(s.rooms.id, roomId));
    expect(room.status).toBe("occupied");

    await expect(
      db.insert(s.leases).values({
        propertyId,
        roomId,
        tenantId,
        startDate: "2026-11-06",
        monthlyRent: 1_500_000,
        billingDay: 6,
      }),
    ).rejects.toMatchObject({ cause: { message: expect.stringContaining("Kamar sudah penuh") } });
  });

  it("kamar dengan sewa aktif tidak bisa diubah manual menjadi kosong", async () => {
    await expect(
      db.update(s.rooms).set({ status: "vacant" }).where(eq(s.rooms.id, roomId)),
    ).rejects.toMatchObject({ cause: { message: expect.stringContaining("penghuni aktif") } });
  });

  it("tagihan: sebagian → lunas → ditolak, dihitung otomatis", async () => {
    const [inv] = await db
      .insert(s.invoices)
      .values({
        propertyId,
        leaseId,
        tenantId,
        roomId,
        number: `KSK-${uniqueCode()}-202611-01`,
        period: "2026-11-01",
        issueDate: "2026-10-29",
        dueDate: "2026-11-05",
      })
      .returning({ id: s.invoices.id });

    await db
      .insert(s.invoiceItems)
      .values({ invoiceId: inv.id, type: "rent", description: "Sewa November 2026", amount: 1_500_000 });
    let [row] = await db.select().from(s.invoices).where(eq(s.invoices.id, inv.id));
    expect(row).toMatchObject({ total: 1_500_000, paidAmount: 0, status: "issued" });

    const base = {
      propertyId,
      invoiceId: inv.id,
      tenantId,
      paidAt: new Date(),
      method: "transfer" as const,
      submittedBy: "staff",
    };
    await db.insert(s.payments).values({ ...base, amount: 500_000, status: "verified" });
    [row] = await db.select().from(s.invoices).where(eq(s.invoices.id, inv.id));
    expect(row).toMatchObject({ paidAmount: 500_000, status: "partial" });

    const [p2] = await db
      .insert(s.payments)
      .values({ ...base, amount: 1_000_000, status: "verified" })
      .returning({ id: s.payments.id });
    [row] = await db.select().from(s.invoices).where(eq(s.invoices.id, inv.id));
    expect(row.status).toBe("paid");
    expect(row.paidAt).toBeInstanceOf(Date);

    // pembayaran kedua ditolak → kembali sebagian
    await db.update(s.payments).set({ status: "rejected" }).where(eq(s.payments.id, p2.id));
    [row] = await db.select().from(s.invoices).where(eq(s.invoices.id, inv.id));
    expect(row).toMatchObject({ paidAmount: 500_000, status: "partial", paidAt: null });

    // pembayaran menunggu verifikasi tidak dihitung
    await db
      .insert(s.payments)
      .values({ ...base, amount: 1_000_000, status: "pending", submittedBy: "tenant" });
    [row] = await db.select().from(s.invoices).where(eq(s.invoices.id, inv.id));
    expect(row.status).toBe("partial");
  });

  it("tagihan ganda untuk sewa & periode yang sama ditolak", async () => {
    await expect(
      db.insert(s.invoices).values({
        propertyId,
        leaseId,
        tenantId,
        roomId,
        number: `KSK-${uniqueCode()}-202611-01`,
        period: "2026-11-01",
        issueDate: "2026-10-29",
        dueDate: "2026-11-05",
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("komplain diberi nomor urut per properti & waktu selesai", async () => {
    const [c1] = await db
      .insert(s.complaints)
      .values({ propertyId, category: "ac", title: "AC tidak dingin" })
      .returning();
    const [c2] = await db
      .insert(s.complaints)
      .values({ propertyId, category: "water", title: "Kran bocor" })
      .returning();
    expect(c2.number).toBe(c1.number + 1);

    const [done] = await db
      .update(s.complaints)
      .set({ status: "resolved" })
      .where(eq(s.complaints.id, c1.id))
      .returning();
    expect(done.resolvedAt).toBeInstanceOf(Date);
  });

  it("check-out mengosongkan kamar", async () => {
    await db.update(s.leases).set({ status: "ended", endDate: "2026-12-31" }).where(eq(s.leases.id, leaseId));
    const [room] = await db.select().from(s.rooms).where(eq(s.rooms.id, roomId));
    expect(room.status).toBe("vacant");
  });
});

describe("Row Level Security", () => {
  it("owner melihat kamar propertinya", async () => {
    const rows = await withUser(db, ownerId, (tx) =>
      tx.select().from(s.rooms).where(eq(s.rooms.propertyId, propertyId)),
    );
    expect(rows).toHaveLength(1);
  });

  it("user lain tidak bisa melihat atau mengubah data properti ini", async () => {
    const rooms = await withUser(db, strangerId, (tx) =>
      tx.select().from(s.rooms).where(eq(s.rooms.propertyId, propertyId)),
    );
    expect(rooms).toHaveLength(0);

    const props = await withUser(db, strangerId, (tx) =>
      tx.select().from(s.properties).where(eq(s.properties.id, propertyId)),
    );
    expect(props).toHaveLength(0);

    const updated = await withUser(db, strangerId, (tx) =>
      tx.update(s.rooms).set({ notes: "dibobol" }).where(eq(s.rooms.propertyId, propertyId)).returning(),
    );
    expect(updated).toHaveLength(0);

    await expect(
      withUser(db, strangerId, (tx) =>
        tx.insert(s.rooms).values({ propertyId, code: "99", monthlyPrice: 1 }),
      ),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("tagihan dan pembayaran tidak bisa dihapus (hanya dibatalkan)", async () => {
    const deleted = await withUser(db, ownerId, (tx) =>
      tx.delete(s.invoices).where(eq(s.invoices.propertyId, propertyId)).returning(),
    );
    expect(deleted).toHaveLength(0);
  });

  it("manager tanpa izin keuangan tidak bisa melihat pengeluaran", async () => {
    const managerId = await createAuthUser(db, `mgr-${uniqueCode()}@test.local`);
    await withUser(db, ownerId, (tx) =>
      tx.insert(s.propertyMembers).values({ propertyId, userId: managerId, role: "manager" }),
    );
    await withUser(db, ownerId, (tx) =>
      tx
        .insert(s.expenses)
        .values({ propertyId, category: "repair", amount: 150_000, spentOn: "2026-11-10" }),
    );

    const ownerView = await withUser(db, ownerId, (tx) =>
      tx.select().from(s.expenses).where(eq(s.expenses.propertyId, propertyId)),
    );
    const managerView = await withUser(db, managerId, (tx) =>
      tx.select().from(s.expenses).where(eq(s.expenses.propertyId, propertyId)),
    );
    expect(ownerView).toHaveLength(1);
    expect(managerView).toHaveLength(0);

    // tapi manager tetap bisa melihat kamar
    const managerRooms = await withUser(db, managerId, (tx) =>
      tx.select().from(s.rooms).where(eq(s.rooms.propertyId, propertyId)),
    );
    expect(managerRooms).toHaveLength(1);
  });

  it("tanpa user (anon) tidak melihat apa pun", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role anon`);
      return tx.select().from(s.properties);
    });
    expect(rows).toHaveLength(0);
  });
});
