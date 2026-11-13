import { describe, expect, it, vi } from "vitest";
import {
  invoiceIdFromOrder,
  mapMidtransStatus,
  MidtransGateway,
  midtransSignature,
  orderIdFor,
} from "@/services/gateway";

const KEY = "SB-Mid-server-TEST";
const uuid = "11111111-2222-4333-8444-555555555555";

describe("Midtrans", () => {
  it("order id memuat id tagihan dan ≤ 50 karakter", () => {
    const id = orderIdFor(uuid, 1793782529719);
    expect(id.length).toBeLessThanOrEqual(50);
    expect(invoiceIdFromOrder(id)).toBe(uuid);
    expect(invoiceIdFromOrder("lain-123")).toBeNull();
  });

  it("signature SHA512(order_id + status_code + gross_amount + server_key)", () => {
    const gw = new MidtransGateway(KEY, false);
    const body = { order_id: "K-x", status_code: "200", gross_amount: "1500000.00" };
    const signature_key = midtransSignature(body.order_id, body.status_code, body.gross_amount, KEY);
    expect(signature_key).toMatch(/^[0-9a-f]{128}$/);
    expect(gw.verifyNotification({ ...body, signature_key })).toEqual({ ok: true, orderId: "K-x" });
    expect(gw.verifyNotification({ ...body, gross_amount: "1.00", signature_key })).toEqual({ ok: false });
    expect(gw.verifyNotification({ ...body })).toEqual({ ok: false });
  });

  it("memetakan status & metode", () => {
    expect(
      mapMidtransStatus({
        transaction_status: "settlement",
        payment_type: "bank_transfer",
        gross_amount: "1500000.00",
      }),
    ).toMatchObject({ state: "settled", method: "va", amount: 1_500_000 });
    expect(mapMidtransStatus({ transaction_status: "capture", fraud_status: "challenge" }).state).toBe(
      "pending",
    );
    expect(mapMidtransStatus({ transaction_status: "pending", payment_type: "qris" })).toMatchObject({
      state: "pending",
      method: "qris",
    });
    expect(mapMidtransStatus({ transaction_status: "expire" }).state).toBe("failed");
    expect(mapMidtransStatus({ transaction_status: "settlement", payment_type: "gopay" }).method).toBe(
      "ewallet",
    );
  });

  it("membuat checkout Snap dengan Basic auth & mengembalikan redirect_url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "t",
          redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/t",
        }),
        { status: 201 },
      ),
    );
    const gw = new MidtransGateway(KEY, false, fetchMock);
    const res = await gw.createCheckout({
      orderId: "K-x",
      amount: 1_500_000,
      customer: { name: "Dewi", phone: "62812" },
      description: "Sewa",
      finishUrl: "https://x",
    });
    expect(res.url).toContain("snap");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://app.sandbox.midtrans.com/snap/v1/transactions");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`${KEY}:`).toString("base64")}`);
    expect(JSON.parse(init.body).transaction_details).toEqual({ order_id: "K-x", gross_amount: 1_500_000 });
  });

  it("base URL simulator dipakai untuk Snap & cek status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ redirect_url: "http://sim/pay/K-x" }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ transaction_status: "settlement", gross_amount: "10.00" }), {
          status: 200,
        }),
      );
    const gw = new MidtransGateway(KEY, false, fetchMock, "http://localhost:3200/midtrans/");
    await gw.createCheckout({
      orderId: "K-x",
      amount: 10,
      customer: { name: "a", phone: "1" },
      description: "x",
      finishUrl: "y",
    });
    expect((await gw.getStatus("K-x")).state).toBe("settled");
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "http://localhost:3200/midtrans/snap/v1/transactions",
      "http://localhost:3200/midtrans/v2/K-x/status",
    ]);
  });

  it("checkout gagal → error berisi pesan Midtrans", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error_messages: ["order_id sudah dipakai"] }), { status: 400 }),
      );
    await expect(
      new MidtransGateway(KEY, false, fetchMock).createCheckout({
        orderId: "K",
        amount: 1,
        customer: { name: "a", phone: "1" },
        description: "x",
        finishUrl: "y",
      }),
    ).rejects.toThrow(/sudah dipakai/);
  });
});
