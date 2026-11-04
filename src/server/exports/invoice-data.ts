import "server-only";
import type { Tx } from "@/db/client";
import { getInvoiceDetail } from "@/services/billing";
import { getProperty, getSettings } from "@/services/properties";
import type { InvoicePdfData } from "./pdf";

/** Data PDF tagihan/kuitansi. `tx` menentukan akses (RLS staf atau filter portal). */
export async function invoicePdfData(tx: Tx, invoiceId: string): Promise<InvoicePdfData | null> {
  const detail = await getInvoiceDetail(tx, invoiceId);
  if (!detail) return null;
  const property = await getProperty(tx, detail.invoice.propertyId);
  const settings = await getSettings(tx, detail.invoice.propertyId);
  return {
    propertyName: property.name,
    propertyAddress: property.address,
    number: detail.invoice.number,
    period: detail.invoice.period,
    dueDate: detail.invoice.dueDate,
    coversFrom: detail.invoice.coversFrom,
    coversTo: detail.invoice.coversTo,
    status: detail.invoice.status,
    tenantName: detail.tenantName,
    roomCode: detail.roomCode,
    items: detail.items.map((i) => ({ description: i.description, type: i.type, amount: i.amount })),
    total: detail.invoice.total,
    paidAmount: detail.invoice.paidAmount,
    payments: detail.payments
      .filter((p) => p.status === "verified")
      .map((p) => ({ amount: p.amount, method: p.method, paidAt: p.paidAt })),
    bankAccounts: settings.bankAccounts,
    timezone: property.timezone,
  };
}

export function fileResponse(body: Buffer, filename: string, type: "xlsx" | "pdf", inline = false) {
  const contentType =
    type === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": contentType,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
