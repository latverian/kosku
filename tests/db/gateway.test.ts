import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withUser } from "@/db/client";
import { creditBalance } from "@/services/billing";
import type { Actor } from "@/services/core";
import { orderIdFor, type GatewayStatus, type PaymentGateway } from "@/services/gateway";
import { handleGatewayNotification, startOnlinePayment } from "@/services/online-payment";
import { createProperty } from "@/services/properties";
import { createRooms } from "@/services/rooms";
import { checkIn } from "@/services/tenants";
import { connect, createAuthUser, s, uniqueCode } from "./helpers";

const { db, client } = connect();
let owner: Actor & { type: "user" };
let tenantId: string;
let invoiceId: string;

/** Gateway tiruan: signature "sah" bila body.sig === "ok"; status diatur tes. */
class FakeGateway implements PaymentGateway {
  name = "fake";
  status: Partial<GatewayStatus> = {};
  checkouts: { orderId: string; amount: number }[] = [];
  async createCheckout(input: { orderId: string; amount: number }) {
    this.checkouts.push(input);
    return { url: `https://pay.test/${input.orderId}` };
  }
  verifyNotification(body: unknown) {
    const b = body as { sig?: string; order_id?: string };
    return b?.sig === "ok" && b.order_id
      ? { ok: true as const, orderId: b.order_id }
      : { ok: false as const };
  }
  async getStatus(orderId: string): Promise<GatewayStatus> {
    return {
      orderId,
      transactionId: "trx-1",
      state: "settled",
      amount: 0,
      method: "va",
      raw: "settlement",
      ...this.status,
    };
  }
}

beforeAll(async () => {
  owner = { type: "user", id: await createAuthUser(db, `gw-${uniqueCode()}@test.local`) };
  const as = <T>(fn: Parameters<typeof withUser<T>>[2]) => withUser(db, owner.id, fn);
  const propertyId = await as(
    async (tx) => (await createProperty(tx, owner, { code: uniqueCode(), name: "Kos Gateway" })).id,
  );
  const [room] = await as((tx) =>
    createRooms(tx, owner, propertyId, [
      {
        code: "G1",
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
  const r = await as((tx) =>
    checkIn(tx, owner, {
      roomId: room.id,
      tenant: {
        fullName: "Gita",
        phone: "6281300000301",
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
        monthlyRent: 1_000_000,
        billingDay: 1,
        depositAmount: 0,
        billingStartPeriod: null,
      },
      today: "2026-11-01",
      sendWelcome: false,
    }),
  );
  tenantId = r.tenant.id;
  invoiceId = r.invoices[0].id;
});

afterAll(async () => {
  await client.end();
});

describe("pembayaran online", () => {
  it("checkout untuk sisa tagihan & menyimpan link", async () => {
    const gw = new FakeGateway();
    const url = await db.transaction((tx) =>
      startOnlinePayment(tx, gw, { tenantId, invoiceId, finishUrl: "https://x" }),
    );
    expect(url).toMatch(/^https:\/\/pay\.test\/K-/);
    expect(gw.checkouts[0].amount).toBe(1_000_000);
    const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
    expect(inv.paymentLink).toBe(url);
  });

  it("tidak bisa untuk tagihan penghuni lain", async () => {
    await expect(
      db.transaction((tx) =>
        startOnlinePayment(tx, new FakeGateway(), { tenantId: owner.id, invoiceId, finishUrl: "x" }),
      ),
    ).rejects.toThrow(/tidak ditemukan/);
  });

  it("notifikasi: signature palsu ditolak, status pending diabaikan", async () => {
    const gw = new FakeGateway();
    const orderId = orderIdFor(invoiceId);
    expect(await handleGatewayNotification(db, gw, { order_id: orderId, sig: "palsu" })).toBe("invalid");
    gw.status = { state: "pending", amount: 1_000_000 };
    expect(await handleGatewayNotification(db, gw, { order_id: orderId, sig: "ok" })).toBe("ignored");
    const paid = await db.select().from(s.payments).where(eq(s.payments.invoiceId, invoiceId));
    expect(paid).toHaveLength(0);
  });

  it("settlement → lunas + WA konfirmasi; notifikasi ulang tidak dobel; nominal diambil dari API", async () => {
    const gw = new FakeGateway();
    const orderId = orderIdFor(invoiceId);
    const trx = `trx-${uniqueCode()}`;
    gw.status = { state: "settled", amount: 1_200_000, transactionId: trx };
    // body notifikasi mengaku 9 jt, tapi yang dipakai nominal dari getStatus
    expect(
      await handleGatewayNotification(db, gw, { order_id: orderId, sig: "ok", gross_amount: "9000000.00" }),
    ).toBe("recorded");
    expect(await handleGatewayNotification(db, gw, { order_id: orderId, sig: "ok" })).toBe("duplicate");

    const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
    expect(inv).toMatchObject({ status: "paid", paidAmount: 1_200_000 });
    const [payment] = await db.select().from(s.payments).where(eq(s.payments.invoiceId, invoiceId));
    expect(payment).toMatchObject({
      method: "va",
      submittedBy: "gateway",
      gatewayRef: trx,
      status: "verified",
    });
    expect(await db.transaction((tx) => creditBalance(tx, tenantId))).toBe(200_000);
    const msgs = await db
      .select()
      .from(s.messages)
      .where(and(eq(s.messages.invoiceId, invoiceId), eq(s.messages.type, "payment_confirmed")));
    expect(msgs).toHaveLength(1);
  });
});
