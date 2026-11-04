import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withUser } from "@/db/client";
import { verifyPayment } from "@/services/billing";
import {
  addComplaintComment,
  createComplaint,
  getComplaintDetail,
  rateComplaint,
  updateComplaint,
} from "@/services/complaints";
import type { Actor } from "@/services/core";
import { configFromEnv, ensurePortalLink, rotatePortalLink } from "@/services/messaging";
import { portalInvoices, resolvePortal, submitPaymentProof } from "@/services/portal";
import { createProperty } from "@/services/properties";
import { createRooms } from "@/services/rooms";
import { checkIn, checkOut } from "@/services/tenants";
import { connect, createAuthUser, s, uniqueCode } from "./helpers";

const { db, client } = connect();
const cfg = configFromEnv();
let owner: Actor & { type: "user" };
let propertyId: string;
let tenantId: string;
let otherTenantId: string;
let leaseId: string;
let token: string;
const as = <T>(fn: Parameters<typeof withUser<T>>[2]) => withUser(db, owner.id, fn);
const tokenOf = (url: string | null) => url!.split("/p/")[1];
const uuid = "11111111-2222-4333-8444-555555555555";

beforeAll(async () => {
  owner = { type: "user", id: await createAuthUser(db, `portal-${uniqueCode()}@test.local`) };
  propertyId = await as(
    async (tx) =>
      (
        await createProperty(tx, owner, {
          code: uniqueCode(),
          name: "Kos Portal",
          contactPhone: "6281200000009",
        })
      ).id,
  );
  const rooms = await as((tx) =>
    createRooms(
      tx,
      owner,
      propertyId,
      ["P1", "P2"].map((code) => ({
        code,
        floor: 1,
        type: null,
        capacity: 1,
        monthlyPrice: 1_200_000,
        depositAmount: 0,
        facilities: [],
        notes: null,
      })),
    ),
  );
  const mk = (roomId: string, name: string, phone: string) =>
    as((tx) =>
      checkIn(tx, owner, {
        roomId,
        tenant: {
          fullName: name,
          phone,
          email: null,
          nik: null,
          occupation: null,
          emergencyName: null,
          emergencyRelation: null,
          emergencyPhone: null,
          notes: null,
        },
        lease: {
          startDate: "2026-11-01",
          endDate: null,
          monthlyRent: 1_200_000,
          billingDay: 1,
          depositAmount: 0,
          billingStartPeriod: null,
        },
        today: "2026-11-01",
      }),
    );
  const a = await mk(rooms[0].id, "Putri", "6281300000101");
  const b = await mk(rooms[1].id, "Raka", "6281300000102");
  tenantId = a.tenant.id;
  leaseId = a.lease.id;
  otherTenantId = b.tenant.id;
  token = tokenOf(await db.transaction((tx) => ensurePortalLink(tx, tenantId, cfg)));
});

afterAll(async () => {
  await client.end();
});

describe("portal penghuni", () => {
  it("token valid membuka portal; token acak/salah ditolak", async () => {
    const session = await db.transaction((tx) => resolvePortal(tx, token));
    expect(session).toMatchObject({ tenantId, tenantName: "Putri", roomCode: "P1", active: true });
    expect(await db.transaction((tx) => resolvePortal(tx, "x".repeat(43)))).toBeNull();
    expect(await db.transaction((tx) => resolvePortal(tx, "../../etc"))).toBeNull();
  });

  it("hanya melihat tagihan sendiri", async () => {
    const list = await db.transaction((tx) => portalInvoices(tx, tenantId));
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((i) => i.tenantId === tenantId)).toBe(true);
  });

  it("upload bukti → pembayaran menunggu + notifikasi pengelola; tidak bisa untuk tagihan orang lain", async () => {
    const [inv] = await db.transaction((tx) => portalInvoices(tx, tenantId));
    const payment = await db.transaction((tx) =>
      submitPaymentProof(tx, tenantId, {
        invoiceId: inv.id,
        amount: 1_200_000,
        paidAt: "2026-11-01",
        proofPath: `${propertyId}/2026-11/${uuid}.jpg`,
        notes: null,
      }),
    );
    expect(payment).toMatchObject({ status: "pending", submittedBy: "tenant" });
    const [notice] = await db
      .select()
      .from(s.messages)
      .where(and(eq(s.messages.propertyId, propertyId), eq(s.messages.type, "proof_uploaded_owner")));
    expect(notice.toPhone).toBe("6281200000009");

    const [otherInv] = await db.transaction((tx) => portalInvoices(tx, otherTenantId));
    await expect(
      db.transaction((tx) =>
        submitPaymentProof(tx, tenantId, {
          invoiceId: otherInv.id,
          amount: 1,
          paidAt: "2026-11-01",
          proofPath: "x",
          notes: null,
        }),
      ),
    ).rejects.toThrow(/tidak ditemukan/);

    // owner memverifikasi → penghuni dapat konfirmasi
    await as((tx) => verifyPayment(tx, owner, payment.id));
    const confirm = await db
      .select()
      .from(s.messages)
      .where(and(eq(s.messages.tenantId, tenantId), eq(s.messages.type, "payment_confirmed")));
    expect(confirm).toHaveLength(1);
  });

  it("link dicabut → token lama tidak berlaku", async () => {
    const fresh = tokenOf(await as((tx) => rotatePortalLink(tx, owner, otherTenantId, cfg)));
    // token versi 1 (lama) untuk Raka
    const { portalToken } = await import("@/lib/portal-token");
    const oldTokenForOther = portalToken(cfg.portalSecret!, otherTenantId, 1);
    expect(await db.transaction((tx) => resolvePortal(tx, oldTokenForOther))).toBeNull();
    expect(await db.transaction((tx) => resolvePortal(tx, fresh))).not.toBeNull();
  });
});

describe("komplain", () => {
  let complaintId: string;

  it("penghuni membuat komplain dengan foto → nomor urut, kamar otomatis, WA ke pengelola", async () => {
    const c = await db.transaction((tx) =>
      createComplaint(
        tx,
        { kind: "tenant", tenantId },
        {
          propertyId,
          category: "ac",
          title: "AC tidak dingin",
          description: "Sudah 2 hari",
          priority: "high",
          photos: [{ path: `${propertyId}/2026-11/${uuid}.jpg`, mimeType: "image/jpeg", sizeBytes: 1234 }],
        },
      ),
    );
    complaintId = c.id;
    expect(c).toMatchObject({ number: 1, status: "open", tenantId });
    expect(c.roomId).not.toBeNull();
    const [msg] = await db
      .select()
      .from(s.messages)
      .where(and(eq(s.messages.complaintId, c.id), eq(s.messages.type, "complaint_new_owner")));
    expect(msg.body).toContain("#1 [Tinggi]");
    expect(msg.body).toContain("Kamar P1");
  });

  it("staf memproses → riwayat + WA ke penghuni; selesai dengan biaya → pengeluaran", async () => {
    await as((tx) =>
      updateComplaint(tx, owner, complaintId, {
        status: "in_progress",
        priority: "high",
        assigneeName: "Pak Joko",
        assigneePhone: null,
        cost: null,
        note: "Teknisi besok pagi",
      }),
    );
    await as((tx) =>
      addComplaintComment(tx, { kind: "staff", actor: owner }, complaintId, "Mohon kamar dibuka jam 9"),
    );
    await db.transaction((tx) =>
      addComplaintComment(tx, { kind: "tenant", tenantId }, complaintId, "Siap, terima kasih"),
    );
    await as((tx) =>
      updateComplaint(tx, owner, complaintId, {
        status: "resolved",
        priority: "high",
        assigneeName: "Pak Joko",
        assigneePhone: null,
        cost: 150_000,
        note: "Freon diisi",
      }),
    );

    const detail = await as((tx) => getComplaintDetail(tx, complaintId));
    expect(detail!.complaint.resolvedAt).toBeInstanceOf(Date);
    expect(detail!.updates.map((u) => [u.update.authorType, u.update.toStatus ?? u.update.body])).toEqual([
      ["tenant", "open"],
      ["staff", "in_progress"],
      ["staff", "Mohon kamar dibuka jam 9"],
      ["tenant", "Siap, terima kasih"],
      ["staff", "resolved"],
    ]);
    expect(detail!.photos).toHaveLength(1);

    const updates = await db
      .select()
      .from(s.messages)
      .where(and(eq(s.messages.complaintId, complaintId), eq(s.messages.type, "complaint_update")));
    expect(updates.map((m) => m.body)).toEqual(
      expect.arrayContaining([expect.stringContaining("*Diproses*"), expect.stringContaining("*Selesai*")]),
    );
    const [expense] = await db.select().from(s.expenses).where(eq(s.expenses.complaintId, complaintId));
    expect(expense).toMatchObject({ amount: 150_000, category: "repair" });
  });

  it("rating hanya oleh pelapor dan setelah selesai; penghuni lain tidak bisa berkomentar", async () => {
    await expect(db.transaction((tx) => rateComplaint(tx, otherTenantId, complaintId, 5))).rejects.toThrow();
    await db.transaction((tx) => rateComplaint(tx, tenantId, complaintId, 5));
    const [c] = await db.select().from(s.complaints).where(eq(s.complaints.id, complaintId));
    expect(c.rating).toBe(5);
    await expect(
      db.transaction((tx) =>
        addComplaintComment(tx, { kind: "tenant", tenantId: otherTenantId }, complaintId, "halo"),
      ),
    ).rejects.toThrow(/tidak ditemukan/);
  });

  it("portal tetap bisa dibuka 30 hari setelah check-out, lalu tidak", async () => {
    await as((tx) =>
      checkOut(tx, owner, {
        leaseId,
        endDate: "2026-11-02",
        reason: null,
        depositStatus: "held",
        depositRefunded: 0,
      }),
    );
    const session = await db.transaction((tx) => resolvePortal(tx, token, "2026-12-02"));
    expect(session?.active).toBe(false);
    expect(await db.transaction((tx) => resolvePortal(tx, token, "2026-12-03"))).toBeNull();
  });
});
