import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { withUser } from "@/db/client";
import { decryptText } from "@/lib/crypto";
import {
  addInvoiceItem,
  applyCredit,
  creditBalance,
  generateInvoicesForLease,
  generateInvoicesForProperty,
  recordPayment,
  rejectPayment,
  removeInvoiceItem,
  verifyPayment,
  voidInvoice,
} from "@/services/billing";
import { ServiceError, SYSTEM, toServiceError, type Actor } from "@/services/core";
import { createProperty, updateSettings } from "@/services/properties";
import { archiveRoom, createRooms, ROOM_UNIQUE_MESSAGES, sequenceCodes } from "@/services/rooms";
import { checkIn, checkOut, moveRoom, type TenantInput } from "@/services/tenants";
import { connect, createAuthUser, s, uniqueCode } from "./helpers";

const { db, client } = connect();
const nikKey = randomBytes(32).toString("base64");

let owner: Actor & { type: "user" };
let propertyId: string;
let roomIds: Record<string, string>;

const as = <T>(fn: Parameters<typeof withUser<T>>[2]) => withUser(db, owner.id, fn);

const tenant = (name: string, over: Partial<TenantInput> = {}): TenantInput => ({
  fullName: name,
  phone: "6281234500000",
  email: null,
  nik: null,
  occupation: null,
  emergencyName: null,
  emergencyRelation: null,
  emergencyPhone: null,
  notes: null,
  ...over,
});

const room = (code: string, price = 1_500_000) => ({
  code,
  floor: 1,
  type: "Standar",
  capacity: 1,
  monthlyPrice: price,
  depositAmount: 500_000,
  facilities: [],
  notes: null,
});

beforeAll(async () => {
  owner = { type: "user", id: await createAuthUser(db, `svc-${uniqueCode()}@test.local`) };
  propertyId = await as(
    async (tx) => (await createProperty(tx, owner, { code: uniqueCode(), name: "Kos Service" })).id,
  );
  const rooms = await as((tx) =>
    createRooms(
      tx,
      owner,
      propertyId,
      sequenceCodes("", 1, 4, 2).map((code) => room(code)),
    ),
  );
  roomIds = Object.fromEntries(rooms.map((r) => [r.code, r.id]));
});

afterAll(async () => {
  await client.end();
});

describe("properti & kamar", () => {
  it("properti baru punya template WA & audit log", async () => {
    const templates = await db
      .select()
      .from(s.messageTemplates)
      .where(eq(s.messageTemplates.propertyId, propertyId));
    expect(templates.length).toBeGreaterThanOrEqual(8);
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.propertyId, propertyId));
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining(["property.create", "room.create_bulk"]),
    );
  });

  it("kode kamar ganda ditolak dengan pesan yang jelas", async () => {
    const error = await as((tx) => createRooms(tx, owner, propertyId, [room("01")])).catch((e) => e);
    expect(toServiceError(error, ROOM_UNIQUE_MESSAGES)?.message).toBe("Kode kamar sudah dipakai di kos ini.");
  });

  it("kode urut untuk tambah massal", () => {
    expect(sequenceCodes("A-", 9, 3, 2)).toEqual(["A-09", "A-10", "A-11"]);
  });
});

describe("check-in → tagihan → pembayaran → check-out", () => {
  let leaseId: string;
  let tenantId: string;
  let firstInvoiceId: string;

  it("check-in membuat penghuni, sewa, tagihan pertama, dan kamar terisi", async () => {
    const result = await as((tx) =>
      checkIn(tx, owner, {
        roomId: roomIds["01"],
        tenant: tenant("Andi", { nik: "3273010101900001" }),
        lease: {
          startDate: "2026-11-05",
          endDate: null,
          monthlyRent: 1_500_000,
          billingDay: 5,
          depositAmount: 500_000,
          billingStartPeriod: null,
        },
        nikKey,
        today: "2026-11-05",
      }),
    );
    leaseId = result.lease.id;
    tenantId = result.tenant.id;
    expect(result.invoices).toHaveLength(1);
    firstInvoiceId = result.invoices[0].id;

    const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, firstInvoiceId));
    expect(inv).toMatchObject({
      total: 1_500_000,
      status: "issued",
      dueDate: "2026-11-05",
      coversTo: "2026-12-05",
    });

    const [r] = await db.select().from(s.rooms).where(eq(s.rooms.id, roomIds["01"]));
    expect(r.status).toBe("occupied");

    // NIK tersimpan terenkripsi
    expect(result.tenant.nikLast4).toBe("0001");
    expect(result.tenant.nikEncrypted).not.toContain("3273");
    expect(decryptText(result.tenant.nikEncrypted!, nikKey)).toBe("3273010101900001");
  });

  it("NIK tanpa kunci enkripsi ditolak", async () => {
    const error = await as((tx) =>
      checkIn(tx, owner, {
        roomId: roomIds["02"],
        tenant: tenant("Tanpa Kunci", { nik: "3273010101900002" }),
        lease: {
          startDate: "2026-11-05",
          endDate: null,
          monthlyRent: 1_500_000,
          billingDay: 5,
          depositAmount: 0,
          billingStartPeriod: null,
        },
        nikKey: null,
      }),
    ).catch((e) => e);
    expect(error).toBeInstanceOf(ServiceError);
    expect(error.message).toContain("NIK_ENCRYPTION_KEY");
  });

  it("pembuatan tagihan idempoten dan mengikuti lead 7 hari", async () => {
    const early = await as((tx) => generateInvoicesForLease(tx, SYSTEM, leaseId, "2026-11-27"));
    expect(early).toHaveLength(0);
    const dec = await as((tx) => generateInvoicesForProperty(tx, SYSTEM, propertyId, "2026-11-28"));
    expect(dec).toBe(1);
    const again = await as((tx) => generateInvoicesForProperty(tx, SYSTEM, propertyId, "2026-11-28"));
    expect(again).toBe(0);
  });

  it("item tambahan & diskon mengubah total; item sewa utama tidak bisa dihapus", async () => {
    const item = await as((tx) =>
      addInvoiceItem(tx, owner, firstInvoiceId, {
        type: "electricity",
        description: "Listrik Oktober",
        amount: 120_000,
      }),
    );
    await as((tx) =>
      addInvoiceItem(tx, owner, firstInvoiceId, { type: "discount", description: "Diskon", amount: 20_000 }),
    );
    let [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, firstInvoiceId));
    expect(inv.total).toBe(1_600_000);

    await as((tx) => removeInvoiceItem(tx, owner, item.id));
    [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, firstInvoiceId));
    expect(inv.total).toBe(1_480_000);

    const [rent] = await db
      .select()
      .from(s.invoiceItems)
      .where(and(eq(s.invoiceItems.invoiceId, firstInvoiceId), eq(s.invoiceItems.type, "rent")));
    await expect(as((tx) => removeInvoiceItem(tx, owner, rent.id))).rejects.toThrow(/sewa utama/);
  });

  it("bayar lebih → lunas + saldo kredit; kredit dipakai otomatis di tagihan berikutnya", async () => {
    await as((tx) =>
      recordPayment(tx, owner, {
        invoiceId: firstInvoiceId,
        amount: 1_500_000,
        method: "transfer",
        paidAt: new Date(),
      }),
    );
    const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, firstInvoiceId));
    expect(inv.status).toBe("paid");
    expect(await as((tx) => creditBalance(tx, tenantId))).toBe(20_000);

    // tagihan Desember sudah dibuat sebelum ada kredit → pakai manual sekali, lalu tagihan Januari otomatis
    const [decInv] = await db
      .select()
      .from(s.invoices)
      .where(and(eq(s.invoices.leaseId, leaseId), eq(s.invoices.period, "2026-12-01")));
    await as((tx) => applyCredit(tx, decInv.id));
    const [decAfter] = await db.select().from(s.invoices).where(eq(s.invoices.id, decInv.id));
    expect(decAfter).toMatchObject({ paidAmount: 20_000, status: "partial" });
    expect(await as((tx) => creditBalance(tx, tenantId))).toBe(0);
  });

  it("bukti menunggu: verifikasi & tolak memperbarui status dan kredit", async () => {
    const [decInv] = await db
      .select()
      .from(s.invoices)
      .where(and(eq(s.invoices.leaseId, leaseId), eq(s.invoices.period, "2026-12-01")));
    const pending = async (amount: number) =>
      (
        await db
          .insert(s.payments)
          .values({
            propertyId,
            invoiceId: decInv.id,
            tenantId,
            amount,
            paidAt: new Date(),
            method: "transfer",
            status: "pending",
            submittedBy: "tenant",
          })
          .returning()
      )[0];

    const p1 = await pending(1_500_000);
    await as((tx) => verifyPayment(tx, owner, p1.id));
    let [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, decInv.id));
    expect(inv.status).toBe("paid");
    expect(await as((tx) => creditBalance(tx, tenantId))).toBe(20_000);

    await expect(as((tx) => verifyPayment(tx, owner, p1.id))).rejects.toThrow(/sudah diproses/);

    const p2 = await pending(100_000);
    await expect(as((tx) => rejectPayment(tx, owner, p2.id, " "))).rejects.toThrow(/Alasan/);
    await as((tx) => rejectPayment(tx, owner, p2.id, "Nominal tidak sesuai"));
    [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, decInv.id));
    expect(inv.status).toBe("paid");
  });

  it("tagihan dengan pembayaran tidak bisa dibatalkan", async () => {
    await expect(as((tx) => voidInvoice(tx, owner, firstInvoiceId, "salah"))).rejects.toThrow(/pembayaran/);
  });

  it("check-out membatalkan tagihan masa depan yang belum dibayar dan mengosongkan kamar", async () => {
    await as((tx) => generateInvoicesForLease(tx, SYSTEM, leaseId, "2026-12-29")); // tagihan Januari
    const { voided } = await as((tx) =>
      checkOut(tx, owner, {
        leaseId,
        endDate: "2027-01-03",
        reason: "Lulus kuliah",
        depositStatus: "refunded",
        depositRefunded: 0,
      }),
    );
    expect(voided.map((v) => v.number)).toEqual([expect.stringContaining("202701")]);
    // saldo kredit yang sempat terpotong ke tagihan Januari dikembalikan
    expect(await as((tx) => creditBalance(tx, tenantId))).toBe(20_000);

    const [lease] = await db.select().from(s.leases).where(eq(s.leases.id, leaseId));
    expect(lease).toMatchObject({ status: "ended", depositStatus: "refunded", depositRefunded: 500_000 });
    const [r] = await db.select().from(s.rooms).where(eq(s.rooms.id, roomIds["01"]));
    expect(r.status).toBe("vacant");

    // tidak ada tagihan baru setelah check-out
    expect(await as((tx) => generateInvoicesForLease(tx, SYSTEM, leaseId, "2027-03-01"))).toHaveLength(0);
  });

  it("kamar dengan penghuni aktif tidak bisa diarsipkan", async () => {
    await as((tx) =>
      checkIn(tx, owner, {
        roomId: roomIds["02"],
        tenant: tenant("Budi"),
        lease: {
          startDate: "2026-11-10",
          endDate: null,
          monthlyRent: 1_500_000,
          billingDay: 10,
          depositAmount: 0,
          billingStartPeriod: null,
        },
        today: "2026-11-10",
      }),
    );
    await expect(as((tx) => archiveRoom(tx, owner, roomIds["02"]))).rejects.toThrow(/penghuni aktif/);
  });
});

describe("pindah kamar & penghuni lama", () => {
  it("pindah: sewa lama selesai, deposit dipindah, sewa baru ditagih mulai siklus berikutnya", async () => {
    const { lease } = await as((tx) =>
      checkIn(tx, owner, {
        roomId: roomIds["03"],
        tenant: tenant("Citra"),
        lease: {
          startDate: "2026-11-15",
          endDate: null,
          monthlyRent: 1_500_000,
          billingDay: 15,
          depositAmount: 500_000,
          billingStartPeriod: null,
        },
        today: "2026-11-15",
      }),
    );
    const moved = await as((tx) =>
      moveRoom(tx, owner, {
        leaseId: lease.id,
        newRoomId: roomIds["04"],
        moveDate: "2026-11-25",
        monthlyRent: 1_800_000,
        today: "2026-11-25",
      }),
    );
    const [old] = await db.select().from(s.leases).where(eq(s.leases.id, lease.id));
    expect(old).toMatchObject({ status: "ended", depositStatus: "transferred", endDate: "2026-11-25" });
    expect(moved.lease).toMatchObject({ billingStartPeriod: "2026-12-01", depositAmount: 500_000 });
    expect(moved.invoices).toHaveLength(0); // siklus Nov sudah ditagih di kamar lama

    const dec = await as((tx) => generateInvoicesForLease(tx, SYSTEM, moved.lease.id, "2026-12-10"));
    expect(dec).toHaveLength(1);
    const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, dec[0].id));
    expect(inv).toMatchObject({ period: "2026-12-01", dueDate: "2026-12-15", total: 1_800_000 });

    const rooms = await db.select().from(s.rooms).where(eq(s.rooms.propertyId, propertyId));
    const status = Object.fromEntries(rooms.map((r) => [r.code, r.status]));
    expect(status["03"]).toBe("vacant");
    expect(status["04"]).toBe("occupied");
  });

  it("nomor tagihan tetap unik saat penghuni baru di kamar yang sama & periode yang sama", async () => {
    const { invoices } = await as((tx) =>
      checkIn(tx, owner, {
        roomId: roomIds["01"],
        tenant: tenant("Dina"),
        lease: {
          startDate: "2026-11-05",
          endDate: null,
          monthlyRent: 1_500_000,
          billingDay: 5,
          depositAmount: 0,
          billingStartPeriod: null,
        },
        today: "2026-11-05",
      }),
    );
    expect(invoices[0].number).toMatch(/-01-2$/);
  });

  it("pengaturan: prorata nonaktif → bulan pertama penuh; hanya owner", async () => {
    await as((tx) =>
      updateSettings(tx, owner, propertyId, {
        invoiceLeadDays: 7,
        prorateFirstMonth: false,
        lateFeeType: "none",
        lateFeeAmount: 0,
        lateFeeMax: null,
        lateFeeGraceDays: 3,
        bankAccounts: [{ bank: "BCA", number: "123", holder: "Uji" }],
      }),
    );
    const [extra] = await as((tx) => createRooms(tx, owner, propertyId, [room("05")]));
    const { invoices } = await as((tx) =>
      checkIn(tx, owner, {
        roomId: extra.id,
        tenant: tenant("Eka"),
        lease: {
          startDate: "2026-11-20",
          endDate: null,
          monthlyRent: 1_500_000,
          billingDay: 1,
          depositAmount: 0,
          billingStartPeriod: null,
        },
        today: "2026-11-20",
      }),
    );
    const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, invoices[0].id));
    expect(inv.total).toBe(1_500_000);

    const stranger = await createAuthUser(db, `x-${uniqueCode()}@test.local`);
    const error = await withUser(db, stranger, (tx) =>
      updateSettings(tx, { type: "user", id: stranger }, propertyId, {
        invoiceLeadDays: 1,
        prorateFirstMonth: true,
        lateFeeType: "none",
        lateFeeAmount: 0,
        lateFeeMax: null,
        lateFeeGraceDays: 0,
        bankAccounts: [],
      }),
    ).catch((e) => e);
    expect(error).toBeInstanceOf(ServiceError);
  });
});

describe("job harian", () => {
  it("membuat tagihan untuk semua properti dan mencatat job_runs", async () => {
    const { runDaily } = await import("@/services/jobs");
    const runGenerateInvoices = (database: typeof db, opts: { now: Date }) =>
      runDaily(database, { ...opts, only: ["generate_invoices"] });
    // 1 Jan 2027 00.30 WIB
    const results = await runGenerateInvoices(db, { now: new Date("2026-12-31T17:30:00Z") });
    const mine = results.find((r) => r.propertyId === propertyId);
    expect(mine?.status).toBe("success");
    expect(mine!.processed).toBeGreaterThan(0);

    const again = await runGenerateInvoices(db, { now: new Date("2026-12-31T17:30:00Z") });
    expect(again.find((r) => r.propertyId === propertyId)?.processed).toBe(0);

    const runs = await db.select().from(s.jobRuns).where(eq(s.jobRuns.propertyId, propertyId));
    expect(runs.length).toBe(2);
    expect(runs.every((r) => r.status === "success")).toBe(true);
  });
});
