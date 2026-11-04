import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withUser } from "@/db/client";
import { applyCredit, recordPayment } from "@/services/billing";
import type { Actor } from "@/services/core";
import { agingReport, createExpense, deleteExpense, monthlyReport, monthlySeries } from "@/services/finance";
import { createProperty } from "@/services/properties";
import { createRooms } from "@/services/rooms";
import { checkIn } from "@/services/tenants";
import { connect, createAuthUser, s, uniqueCode } from "./helpers";

const { db, client } = connect();
let owner: Actor & { type: "user" };
let propertyId: string;
let novInvoice: string;
const as = <T>(fn: Parameters<typeof withUser<T>>[2]) => withUser(db, owner.id, fn);

beforeAll(async () => {
  owner = { type: "user", id: await createAuthUser(db, `fin-${uniqueCode()}@test.local`) };
  propertyId = await as(
    async (tx) => (await createProperty(tx, owner, { code: uniqueCode(), name: "Kos Keuangan" })).id,
  );
  const [room] = await as((tx) =>
    createRooms(tx, owner, propertyId, [
      {
        code: "K1",
        floor: 1,
        type: null,
        capacity: 1,
        monthlyPrice: 1_000_000,
        depositAmount: 0,
        facilities: [],
        notes: null,
      },
    ]),
  );
  const { invoices } = await as((tx) =>
    checkIn(tx, owner, {
      roomId: room.id,
      tenant: {
        fullName: "Lina",
        phone: "6281300000201",
        email: null,
        nik: null,
        occupation: null,
        emergencyName: null,
        emergencyRelation: null,
        emergencyPhone: null,
        notes: null,
      },
      lease: {
        startDate: "2026-10-05",
        endDate: null,
        monthlyRent: 1_000_000,
        billingDay: 5,
        depositAmount: 0,
        billingStartPeriod: null,
      },
      today: "2026-11-05",
      sendWelcome: false,
    }),
  );
  const oct = invoices.find((i) => i.period === "2026-10-01")!;
  novInvoice = invoices.find((i) => i.period === "2026-11-01")!.id;
  // Oktober: transfer 1.2 jt (lebih 200 rb) pada 30 Nov 18.00 UTC = 1 Des 01.00 WIB
  await as((tx) =>
    recordPayment(tx, owner, {
      invoiceId: oct.id,
      amount: 1_200_000,
      method: "transfer",
      paidAt: new Date("2026-11-30T18:00:00Z"),
      notify: false,
    }),
  );
  // November: tunai 300 rb pada 20 Nov + potongan saldo 200 rb
  await as((tx) =>
    recordPayment(tx, owner, {
      invoiceId: novInvoice,
      amount: 300_000,
      method: "cash",
      paidAt: new Date("2026-11-20T05:00:00Z"),
      notify: false,
    }),
  );
  await as((tx) => applyCredit(tx, novInvoice));
  await as((tx) =>
    createExpense(tx, owner, propertyId, {
      category: "electricity",
      amount: 250_000,
      spentOn: "2026-11-10",
      description: "Token listrik",
    }),
  );
  await as((tx) =>
    createExpense(tx, owner, propertyId, {
      category: "repair",
      amount: 50_000,
      spentOn: "2026-12-01",
      description: "Kran",
    }),
  );
});

afterAll(async () => {
  await client.end();
});

describe("laporan keuangan", () => {
  it("laba-rugi November: kas per metode, tanpa potongan saldo, pengeluaran per kategori", async () => {
    const r = await as((tx) => monthlyReport(tx, propertyId, "2026-11-01"));
    expect(r.incomeByMethod).toEqual([{ method: "cash", amount: 300_000, count: 1 }]);
    expect(r.income).toBe(300_000);
    expect(r.creditApplied).toBe(200_000);
    expect(r.expenses).toBe(250_000);
    expect(r.net).toBe(50_000);
    expect(r.billed).toBe(1_000_000);
    expect(r.billedPaid).toBe(500_000);
  });

  it("pembayaran dicatat menurut tanggal di zona waktu properti (1 Des WIB → Desember)", async () => {
    const dec = await as((tx) => monthlyReport(tx, propertyId, "2026-12-01"));
    expect(dec.income).toBe(1_200_000);
    expect(dec.expenses).toBe(50_000);
  });

  it("seri bulanan untuk grafik", async () => {
    const series = await as((tx) => monthlySeries(tx, propertyId, "2026-12-01", 3));
    expect(series.map((m) => m.period)).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"]);
    expect(series[0]).toMatchObject({ billed: 1_000_000, billedPaid: 1_000_000, income: 0 });
    expect(series[1]).toMatchObject({ income: 300_000, expenses: 250_000, net: 50_000 });
    expect(series[2]).toMatchObject({ income: 1_200_000, net: 1_150_000 });
  });

  it("umur tunggakan", async () => {
    const aging = await as((tx) => agingReport(tx, propertyId, "2026-11-20"));
    expect(aging.rows).toHaveLength(1);
    expect(aging.rows[0]).toMatchObject({ remaining: 500_000, bucket: "d8_30" });
    expect(aging.totals.d8_30).toBe(500_000);
  });

  it("pengelola tanpa izin keuangan tidak bisa melihat/menghapus pengeluaran", async () => {
    const managerId = await createAuthUser(db, `mgr-${uniqueCode()}@test.local`);
    await as((tx) => tx.insert(s.propertyMembers).values({ propertyId, userId: managerId, role: "manager" }));
    const report = await withUser(db, managerId, (tx) => monthlyReport(tx, propertyId, "2026-11-01"));
    expect(report.expenses).toBe(0);
    const [exp] = await db
      .select()
      .from(s.expenses)
      .where(and(eq(s.expenses.propertyId, propertyId), eq(s.expenses.category, "repair")));
    await expect(
      withUser(db, managerId, (tx) => deleteExpense(tx, { type: "user", id: managerId }, exp.id)),
    ).rejects.toThrow(/tidak punya akses/);
  });
});
