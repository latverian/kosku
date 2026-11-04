/**
 * Payment gateway (specs/05-architecture.md § 3.2). Logika bisnis hanya
 * mengenal interface ini; implementasi default Midtrans Snap.
 *
 * Alur: portal → createCheckout (redirect ke halaman bayar Midtrans) →
 * Midtrans memanggil /api/webhooks/payment → verifikasi signature → cek
 * ulang status ke API Midtrans → catat pembayaran (idempoten via gateway_ref).
 */
import { createHash, timingSafeEqual } from "node:crypto";

export type CheckoutInput = {
  orderId: string;
  amount: number;
  customer: { name: string; phone: string };
  description: string;
  finishUrl: string;
};

export type GatewayStatus = {
  orderId: string;
  transactionId: string;
  /** settled = uang sudah masuk */
  state: "settled" | "pending" | "failed";
  amount: number;
  method: "va" | "qris" | "ewallet" | "other";
  raw: string;
};

export interface PaymentGateway {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<{ url: string }>;
  /** Validasi tanda tangan notifikasi; kembalikan orderId bila sah. */
  verifyNotification(body: unknown): { ok: true; orderId: string } | { ok: false };
  getStatus(orderId: string): Promise<GatewayStatus>;
}

/** order_id Midtrans maks. 50 karakter: "K-<uuid tagihan>-<waktu base36>". */
export function orderIdFor(invoiceId: string, now = Date.now()): string {
  return `K-${invoiceId}-${now.toString(36)}`;
}

export function invoiceIdFromOrder(orderId: string): string | null {
  const m = /^K-([0-9a-f-]{36})-[0-9a-z]+$/.exec(orderId);
  return m ? m[1] : null;
}

type MidtransStatus = {
  order_id?: string;
  transaction_id?: string;
  transaction_status?: string;
  fraud_status?: string;
  status_code?: string;
  gross_amount?: string;
  payment_type?: string;
  signature_key?: string;
};

export function midtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
) {
  return createHash("sha512")
    .update(orderId + statusCode + grossAmount + serverKey)
    .digest("hex");
}

export function mapMidtransStatus(data: MidtransStatus): GatewayStatus {
  const status = data.transaction_status ?? "";
  const settled =
    status === "settlement" || (status === "capture" && (data.fraud_status ?? "accept") === "accept");
  const failed = ["deny", "cancel", "expire", "failure", "refund", "partial_refund", "chargeback"].includes(
    status,
  );
  const type = data.payment_type ?? "";
  const method: GatewayStatus["method"] =
    type === "bank_transfer" || type === "echannel" || type === "permata"
      ? "va"
      : type === "qris"
        ? "qris"
        : type === "gopay" || type === "shopeepay" || type === "dana" || type === "ovo"
          ? "ewallet"
          : "other";
  return {
    orderId: data.order_id ?? "",
    transactionId: data.transaction_id ?? "",
    state: settled ? "settled" : failed ? "failed" : "pending",
    // gross_amount Midtrans berbentuk "1500000.00"
    amount: Math.round(Number(data.gross_amount ?? "0")),
    method,
    raw: status,
  };
}

export class MidtransGateway implements PaymentGateway {
  readonly name = "midtrans";
  private readonly snapUrl: string;
  private readonly apiUrl: string;

  constructor(
    private readonly serverKey: string,
    production: boolean,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.snapUrl = production
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions";
    this.apiUrl = production ? "https://api.midtrans.com/v2" : "https://api.sandbox.midtrans.com/v2";
  }

  private headers() {
    return {
      Authorization: `Basic ${Buffer.from(`${this.serverKey}:`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  async createCheckout(input: CheckoutInput) {
    const res = await this.fetchImpl(this.snapUrl, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        transaction_details: { order_id: input.orderId, gross_amount: input.amount },
        item_details: [
          { id: "sewa", name: input.description.slice(0, 50), price: input.amount, quantity: 1 },
        ],
        customer_details: { first_name: input.customer.name.slice(0, 50), phone: input.customer.phone },
        callbacks: { finish: input.finishUrl },
        expiry: { unit: "hours", duration: 24 },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => null)) as {
      redirect_url?: string;
      error_messages?: string[];
    } | null;
    if (!res.ok || !data?.redirect_url) {
      throw new Error(`Midtrans: ${data?.error_messages?.join(", ") ?? `HTTP ${res.status}`}`);
    }
    return { url: data.redirect_url };
  }

  verifyNotification(body: unknown) {
    const b = (body ?? {}) as MidtransStatus;
    if (!b.order_id || !b.status_code || !b.gross_amount || !b.signature_key) return { ok: false as const };
    const expected = Buffer.from(
      midtransSignature(b.order_id, b.status_code, b.gross_amount, this.serverKey),
    );
    const actual = Buffer.from(b.signature_key);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      return { ok: false as const };
    return { ok: true as const, orderId: b.order_id };
  }

  async getStatus(orderId: string) {
    const res = await this.fetchImpl(`${this.apiUrl}/${encodeURIComponent(orderId)}/status`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as MidtransStatus;
    return mapMidtransStatus({ order_id: orderId, ...data });
  }
}

export function gatewayFromEnv(env: Record<string, string | undefined> = process.env): PaymentGateway | null {
  if (!env.MIDTRANS_SERVER_KEY) return null;
  return new MidtransGateway(env.MIDTRANS_SERVER_KEY, env.MIDTRANS_IS_PRODUCTION === "true");
}
