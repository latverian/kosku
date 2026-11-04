import type { NextRequest } from "next/server";
import { asUser } from "@/db";
import { periodOf, todayIn } from "@/lib/billing";
import { periodFromMonthParam } from "@/lib/finance";
import { getCurrentUser } from "@/server/auth";
import { getActiveProperty } from "@/server/dashboard";
import { agingXlsx, monthlyReportXlsx, yearlyReportXlsx } from "@/server/exports/excel";
import { fileResponse } from "@/server/exports/invoice-data";
import { monthlyReportPdf } from "@/server/exports/pdf";
import { getMembership } from "@/server/membership";
import { agingReport, monthlyReport, monthlySeries } from "@/services/finance";

/** Ekspor laporan (FR-9.4). Hanya owner / pengelola dengan izin keuangan. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/reports/[kind]">) {
  const { kind } = await params;
  const user = await getCurrentUser();
  const property = await getActiveProperty(user.id);
  if (!property) return new Response("Properti tidak ditemukan", { status: 404 });
  const membership = await getMembership(user, property.id);
  if (!membership.canViewFinance && !user.preview) return new Response("Tidak punya akses", { status: 403 });

  const sp = request.nextUrl.searchParams;
  const format = sp.get("format") === "pdf" ? "pdf" : "xlsx";
  const today = todayIn(property.timezone);
  const slug = property.code.toLowerCase();

  if (kind === "monthly") {
    const period = periodFromMonthParam(sp.get("bulan")) ?? periodOf(today);
    const report = await asUser(user.id, (tx) => monthlyReport(tx, property.id, period));
    const name = `kosku-${slug}-laporan-${period.slice(0, 7)}.${format}`;
    return format === "pdf"
      ? fileResponse(await monthlyReportPdf(property.name, report), name, "pdf")
      : fileResponse(await monthlyReportXlsx(property.name, report), name, "xlsx");
  }
  if (kind === "yearly") {
    const end = periodFromMonthParam(sp.get("akhir")) ?? periodOf(today);
    const rows = await asUser(user.id, (tx) => monthlySeries(tx, property.id, end, 12));
    return fileResponse(
      await yearlyReportXlsx(property.name, rows),
      `kosku-${slug}-12-bulan-${end.slice(0, 7)}.xlsx`,
      "xlsx",
    );
  }
  if (kind === "aging") {
    const aging = await asUser(user.id, (tx) => agingReport(tx, property.id, today));
    return fileResponse(
      await agingXlsx(property.name, today, aging.rows),
      `kosku-${slug}-tunggakan-${today}.xlsx`,
      "xlsx",
    );
  }
  return new Response("Tidak ditemukan", { status: 404 });
}
