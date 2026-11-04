import { asUser } from "@/db";
import { getCurrentUser } from "@/server/auth";
import { fileResponse, invoicePdfData } from "@/server/exports/invoice-data";
import { invoicePdf } from "@/server/exports/pdf";

/** PDF tagihan/kuitansi untuk staf (RLS membatasi ke properti miliknya). */
export async function GET(_request: Request, { params }: RouteContext<"/api/invoices/[id]/pdf">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Tidak ditemukan", { status: 404 });
  const user = await getCurrentUser();
  const data = await asUser(user.id, (tx) => invoicePdfData(tx, id));
  if (!data) return new Response("Tidak ditemukan", { status: 404 });
  return fileResponse(
    await invoicePdf(data),
    `${data.status === "paid" ? "kuitansi" : "tagihan"}-${data.number}.pdf`,
    "pdf",
    true,
  );
}
