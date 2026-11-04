import { and, eq } from "drizzle-orm";
import { adminDb, schema } from "@/db";
import { fileResponse, invoicePdfData } from "@/server/exports/invoice-data";
import { invoicePdf } from "@/server/exports/pdf";
import { getPortal } from "@/server/portal";

/** Kuitansi/tagihan untuk penghuni — hanya tagihan miliknya sendiri. */
export async function GET(_request: Request, { params }: RouteContext<"/p/[token]/tagihan/[id]/pdf">) {
  const { token, id } = await params;
  const portal = await getPortal(token);
  if (!portal || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Link tidak berlaku", { status: 404 });
  const data = await adminDb().transaction(async (tx) => {
    const [own] = await tx
      .select({ id: schema.invoices.id })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.id, id), eq(schema.invoices.tenantId, portal.tenantId)));
    return own ? invoicePdfData(tx, id) : null;
  });
  if (!data || data.status === "void") return new Response("Tidak ditemukan", { status: 404 });
  return fileResponse(
    await invoicePdf(data),
    `${data.status === "paid" ? "kuitansi" : "tagihan"}-${data.number}.pdf`,
    "pdf",
    true,
  );
}
