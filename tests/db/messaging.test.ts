import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withUser } from "@/db/client";
import { hashPortalToken } from "@/lib/portal-token";
import { applyLateFees, recordPayment } from "@/services/billing";
import { SYSTEM, type Actor } from "@/services/core";
import {
  configFromEnv,
  createBroadcast,
  enqueue,
  rotatePortalLink,
  scheduleReminders,
  sendQueued,
} from "@/services/messaging";
import { createProperty, updateSettings } from "@/services/properties";
import { createRooms } from "@/services/rooms";
import { checkIn } from "@/services/tenants";
import { ConsoleProvider, type SendResult, type WhatsAppProvider } from "@/services/whatsapp";
import { runDaily } from "@/services/jobs";
import { connect, createAuthUser, s, uniqueCode } from "./helpers";

const { db, client } = connect();
let owner: Actor & { type: "user" };
let propertyId: string;
const roomIds: Record<string, string> = {};
const as = <T>(fn: Parameters<typeof withUser<T>>[2]) => withUser(db, owner.id, fn);
const cfg = configFromEnv();

const tenant = (name: string, phone: string) => ({
  fullName: name,
  phone,
  email: null,
  nik: null,
  occupation: null,
  emergencyName: null,
  emergencyRelation: null,
  emergencyPhone: null,
  notes: null,
});

// 10.00 WIB pada tanggal tertentu
const at = (date: string, hourWib = 10) => new Date(`${date}T${String(hourWib - 7).padStart(2, "0")}:00:00Z`);
const msgs = (where = eq(s.messages.propertyId, propertyId)) => db.select().from(s.messages).where(where);

beforeAll(async () => {
  owner = { type: "user", id: await createAuthUser(db, `msg-${uniqueCode()}@test.local`) };
  propertyId = await as(
    async (tx) =>
      (
        await createProperty(tx, owner, {
          code: uniqueCode(),
          name: "Kos Pesan",
          contactPhone: "6281200000001",
        })
      ).id,
  );
  await as((tx) =>
    updateSettings(tx, owner, propertyId, {
      invoiceLeadDays: 7,
      prorateFirstMonth: true,
      lateFeeType: "daily",
      lateFeeAmount: 5_000,
      lateFeeMax: 20_000,
      lateFeeGraceDays: 3,
      bankAccounts: [{ bank: "BCA", number: "111", holder: "Pemilik" }],
    }),
  );
  const rooms = await as((tx) =>
    createRooms(
      tx,
      owner,
      propertyId,
      ["A1", "A2", "B1"].map((code, i) => ({
        code,
        floor: i < 2 ? 1 : 2,
        type: null,
        capacity: 1,
        monthlyPrice: 1_000_000,
        depositAmount: 0,
        facilities: [],
        notes: null,
      })),
    ),
  );
  for (const r of rooms) roomIds[r.code] = r.id;
});

afterAll(async () => {
  await client.end();
});

describe("pesan WhatsApp", () => {
  let tenantId: string;
  let leaseId: string;

  it("check-in mengantrikan sambutan berisi link portal & menyimpan hash token", async () => {
    const r = await as((tx) =>
      checkIn(tx, owner, {
        roomId: roomIds.A1,
        tenant: tenant("Ani", "6281300000001"),
        lease: {
          startDate: "2026-11-10",
          endDate: null,
          monthlyRent: 1_000_000,
          billingDay: 10,
          depositAmount: 0,
          billingStartPeriod: null,
        },
        today: "2026-11-10",
      }),
    );
    tenantId = r.tenant.id;
    leaseId = r.lease.id;
    const [welcome] = await msgs(and(eq(s.messages.tenantId, tenantId), eq(s.messages.type, "welcome")));
    expect(welcome.body).toContain("Selamat datang di Kos Pesan, Ani");
    const link = welcome.body.match(/https:\/\/kosku\.test\/p\/([A-Za-z0-9_-]{43})/);
    expect(link).not.toBeNull();
    const [t] = await db.select().from(s.tenants).where(eq(s.tenants.id, tenantId));
    expect(t.portalTokenHash).toBe(hashPortalToken(link![1]));
  });

  it("jam tenang: pesan jam 21.00 WIB dijadwalkan besok 08.00", async () => {
    const row = await as((tx) =>
      enqueue(tx, {
        propertyId,
        toPhone: "6281300000001",
        type: "manual",
        body: "uji",
        now: at("2026-11-10", 21),
      }),
    );
    expect(row!.scheduledAt.toISOString()).toBe("2026-11-11T01:00:00.000Z");
  });

  it("pembayaran dicatat → konfirmasi; cicilan kedua juga terkirim (tidak bentrok)", async () => {
    const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.leaseId, leaseId));
    for (const amount of [400_000, 600_000]) {
      await as((tx) =>
        recordPayment(tx, owner, { invoiceId: inv.id, amount, method: "cash", paidAt: new Date() }),
      );
    }
    const confirmations = await msgs(
      and(eq(s.messages.invoiceId, inv.id), eq(s.messages.type, "payment_confirmed")),
    );
    expect(confirmations.map((m) => m.body.match(/sebesar (Rp[\d.]+)/)?.[1])).toEqual(
      expect.arrayContaining(["Rp400.000", "Rp600.000"]),
    );
  });

  it("pengingat H-3 dijadwalkan sekali; penghuni yang di-mute dilewati; lunas tidak diingatkan", async () => {
    const { lease: lease2, tenant: t2 } = await as((tx) =>
      checkIn(tx, owner, {
        roomId: roomIds.A2,
        tenant: tenant("Budi", "6281300000002"),
        lease: {
          startDate: "2026-10-15",
          endDate: null,
          monthlyRent: 1_000_000,
          billingDay: 15,
          depositAmount: 0,
          billingStartPeriod: "2026-11-01",
        },
        today: "2026-11-12",
        sendWelcome: false,
      }),
    );
    const { tenant: t3 } = await as((tx) =>
      checkIn(tx, owner, {
        roomId: roomIds.B1,
        tenant: tenant("Citra", "6281300000003"),
        lease: {
          startDate: "2026-10-15",
          endDate: null,
          monthlyRent: 1_000_000,
          billingDay: 15,
          depositAmount: 0,
          billingStartPeriod: "2026-11-01",
        },
        today: "2026-11-12",
        sendWelcome: false,
      }),
    );
    await db.update(s.tenants).set({ remindersMuted: true }).where(eq(s.tenants.id, t3.id));

    // 12 Nov = H-3 untuk jatuh tempo 15 Nov
    expect(await as((tx) => scheduleReminders(tx, propertyId, at("2026-11-12"), cfg))).toBe(1);
    expect(await as((tx) => scheduleReminders(tx, propertyId, at("2026-11-12"), cfg))).toBe(0);
    const [reminder] = await msgs(
      and(eq(s.messages.tenantId, t2.id), eq(s.messages.type, "reminder_before")),
    );
    expect(reminder.body).toContain("Rp1.000.000");
    expect(reminder.body).toContain("BCA 111 a.n. Pemilik");
    expect(reminder.body).toContain("15 Nov 2026");

    // Ani sudah lunas → tidak ada pengingat untuk tagihannya
    const aniReminders = await msgs(
      and(eq(s.messages.tenantId, tenantId), eq(s.messages.type, "reminder_before")),
    );
    expect(aniReminders).toHaveLength(0);
    void lease2;
  });

  it("denda harian setelah masa tenggang, idempoten, dibatasi maksimum", async () => {
    const [inv] = await db
      .select()
      .from(s.invoices)
      .innerJoin(s.tenants, eq(s.tenants.id, s.invoices.tenantId))
      .where(and(eq(s.tenants.fullName, "Budi"), eq(s.invoices.propertyId, propertyId)));
    const fee = async (today: string) => {
      await as((tx) => applyLateFees(tx, SYSTEM, propertyId, today));
      const [row] = await db.select().from(s.invoices).where(eq(s.invoices.id, inv.invoices.id));
      return row.total - 1_000_000;
    };
    expect(await fee("2026-11-18")).toBe(0); // telat 3 hari = masa tenggang
    expect(await fee("2026-11-20")).toBe(10_000); // telat 5 hari → 2 × 5.000
    expect(await fee("2026-11-20")).toBe(10_000); // idempoten
    expect(await fee("2026-12-30")).toBe(20_000); // maksimum
    const items = await db
      .select()
      .from(s.invoiceItems)
      .where(and(eq(s.invoiceItems.invoiceId, inv.invoices.id), eq(s.invoiceItems.type, "late_fee")));
    expect(items).toHaveLength(1);
  });

  it("broadcast ke satu lantai", async () => {
    const { recipients } = await as((tx) =>
      createBroadcast(tx, owner, propertyId, {
        title: "Air mati",
        body: "Halo {nama} kamar {kamar}, air mati besok.",
        audience: { floors: [2] },
      }),
    );
    expect(recipients).toBe(1);
    const [b] = await msgs(eq(s.messages.type, "broadcast"));
    expect(b.body).toBe("Halo Citra kamar B1, air mati besok.");
  });

  it("rotasi link portal mengganti hash", async () => {
    const [before] = await db.select().from(s.tenants).where(eq(s.tenants.id, tenantId));
    const url = await as((tx) => rotatePortalLink(tx, owner, tenantId, cfg));
    const [after] = await db.select().from(s.tenants).where(eq(s.tenants.id, tenantId));
    expect(after.portalTokenVersion).toBe(before.portalTokenVersion + 1);
    expect(after.portalTokenHash).not.toBe(before.portalTokenHash);
    expect(url).toMatch(/^https:\/\/kosku\.test\/p\//);
  });
});

describe("worker pengirim", () => {
  const scope = () => ({ propertyId, delayMs: 0, now: () => new Date("2026-12-31T05:00:00Z") });

  it("mengirim semua yang sudah waktunya & melewati pengingat tagihan yang sudah lunas", async () => {
    // tandai satu pengingat untuk tagihan lunas
    const [paidInvoice] = await db
      .select()
      .from(s.invoices)
      .where(and(eq(s.invoices.propertyId, propertyId), eq(s.invoices.status, "paid")));
    await db.insert(s.messages).values({
      propertyId,
      toPhone: "62813",
      type: "reminder_due",
      body: "x",
      invoiceId: paidInvoice.id,
      scheduledAt: new Date("2026-01-01"),
    });

    const provider = new ConsoleProvider(false);
    const result = await sendQueued(db, provider, { ...scope(), limit: 100 });
    expect(result.skipped).toBe(1);
    expect(result.sent).toBeGreaterThan(3);
    expect(provider.sent.length).toBe(result.sent);
    const left = await msgs(and(eq(s.messages.propertyId, propertyId), eq(s.messages.status, "queued")));
    expect(left).toHaveLength(0);
  });

  it("gagal sementara → dicoba ulang dengan jeda; setelah 3x → gagal", async () => {
    const [m] = await db
      .insert(s.messages)
      .values({
        propertyId,
        toPhone: "62813",
        type: "manual",
        body: "retry",
        scheduledAt: new Date("2026-01-01"),
      })
      .returning();
    const flaky: WhatsAppProvider = {
      name: "flaky",
      send: async (): Promise<SendResult> => ({ ok: false, error: "device disconnected", retryable: true }),
    };
    let clock = new Date("2026-12-31T05:00:00Z");
    for (let i = 1; i <= 3; i++) {
      const r = await sendQueued(db, flaky, { propertyId, delayMs: 0, now: () => clock });
      const [row] = await db.select().from(s.messages).where(eq(s.messages.id, m.id));
      expect(row.attempts).toBe(i);
      expect(row.status).toBe(i < 3 ? "queued" : "failed");
      expect(r.retried + r.failed).toBe(1);
      clock = new Date(clock.getTime() + 60 * 60_000);
    }
  });

  it("gagal permanen langsung ditandai gagal", async () => {
    const [m] = await db
      .insert(s.messages)
      .values({
        propertyId,
        toPhone: "62813",
        type: "manual",
        body: "bad",
        scheduledAt: new Date("2026-01-01"),
      })
      .returning();
    const bad: WhatsAppProvider = {
      name: "bad",
      send: async () => ({ ok: false, error: "invalid token", retryable: false }),
    };
    await sendQueued(db, bad, scope());
    const [row] = await db.select().from(s.messages).where(eq(s.messages.id, m.id));
    expect(row).toMatchObject({ status: "failed", attempts: 1, error: "invalid token" });
  });

  it("job harian menjalankan 3 langkah per kos", async () => {
    const results = await runDaily(db, { now: at("2026-12-12") });
    const mine = results.filter((r) => r.propertyId === propertyId);
    expect(mine.map((r) => r.job)).toEqual(["generate_invoices", "apply_late_fees", "schedule_reminders"]);
    expect(mine.every((r) => r.status === "success")).toBe(true);
  });
});
