import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { asUser, schema } from "@/db";
import { formatDate, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireContext } from "@/server/actions";
import { signedUrl } from "@/server/uploads";
import { CATEGORY_LABEL, getComplaintDetail, PRIORITY_LABEL, STATUS_LABEL } from "@/services/complaints";
import { and, eq } from "drizzle-orm";
import { PRIORITY_TONE } from "@/components/complaint-tone";
import { StaffCommentForm, UpdateComplaintForm } from "../forms";

export const metadata: Metadata = { title: "Detail komplain" };

export default async function ComplaintDetailPage({ params }: PageProps<"/komplain/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, property } = await requireContext();
  const data = await asUser(user.id, async (tx) => {
    const detail = await getComplaintDetail(tx, id);
    const [member] = await tx
      .select({ role: schema.propertyMembers.role, canViewFinance: schema.propertyMembers.canViewFinance })
      .from(schema.propertyMembers)
      .where(
        and(eq(schema.propertyMembers.propertyId, property.id), eq(schema.propertyMembers.userId, user.id)),
      );
    return detail
      ? {
          detail,
          canViewFinance: user.preview || member?.role === "owner" || Boolean(member?.canViewFinance),
        }
      : null;
  });
  if (!data) notFound();
  const { complaint, updates, photos, roomCode, tenantName, tenantPhone } = data.detail;
  const photoUrls = await Promise.all(photos.map((p) => signedUrl("complaint-photos", p.path)));
  const closed = complaint.status === "resolved" || complaint.status === "rejected";

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/komplain" className="text-sm text-muted-foreground hover:underline">
        ← Komplain
      </Link>
      <PageHeader
        title={`#${complaint.number} ${complaint.title}`}
        description={[
          roomCode ? `Kamar ${roomCode}` : (complaint.location ?? "Area umum"),
          tenantName,
          CATEGORY_LABEL[complaint.category],
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <span
            className={cn("rounded-full px-2.5 py-1 text-sm font-medium", PRIORITY_TONE[complaint.priority])}
          >
            {PRIORITY_LABEL[complaint.priority]} · {STATUS_LABEL[complaint.status]}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-4 text-sm">
              <p className="text-xs text-muted-foreground">
                Dilaporkan {formatDate(complaint.createdAt, property.timezone)}
              </p>
              {complaint.description ? (
                <p className="whitespace-pre-line">{complaint.description}</p>
              ) : (
                <p className="text-muted-foreground">Tanpa keterangan.</p>
              )}
              {photoUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {photoUrls.map((url, i) =>
                    url ? (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL berumur pendek */}
                        <img
                          src={url}
                          alt={`Foto ${i + 1}`}
                          className="aspect-square w-full rounded-lg object-cover"
                        />
                      </a>
                    ) : (
                      <span
                        key={i}
                        className="grid aspect-square place-items-center rounded-lg bg-muted text-xs text-muted-foreground"
                      >
                        Foto tidak tersedia
                      </span>
                    ),
                  )}
                </div>
              )}
              {complaint.rating && (
                <p>
                  Penilaian penghuni: {"★".repeat(complaint.rating)}
                  {"☆".repeat(5 - complaint.rating)}
                </p>
              )}
              {complaint.cost != null && data.canViewFinance && (
                <p>Biaya perbaikan: {formatRupiah(complaint.cost)}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Riwayat & percakapan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ol className="space-y-2 text-sm">
                {updates.map(({ update, authorName }) => (
                  <li
                    key={update.id}
                    className={
                      update.authorType === "tenant"
                        ? "mr-8 rounded-lg bg-muted p-2.5"
                        : "ml-8 rounded-lg bg-accent p-2.5"
                    }
                  >
                    <p className="text-xs text-muted-foreground">
                      {update.authorType === "tenant"
                        ? (tenantName ?? "Penghuni")
                        : (authorName ?? "Pengelola")}{" "}
                      · {formatDate(update.createdAt, property.timezone)}
                    </p>
                    {update.toStatus && (
                      <p className="font-medium">
                        {update.fromStatus ? `${STATUS_LABEL[update.fromStatus]} → ` : ""}
                        {STATUS_LABEL[update.toStatus]}
                      </p>
                    )}
                    {update.body && <p className="whitespace-pre-line">{update.body}</p>}
                  </li>
                ))}
              </ol>
              <StaffCommentForm complaintId={complaint.id} disabled={!complaint.tenantId} />
              {!complaint.tenantId && (
                <p className="text-xs text-muted-foreground">Komplain area umum tanpa pelapor penghuni.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{closed ? "Ubah komplain" : "Tindak lanjut"}</CardTitle>
            </CardHeader>
            <CardContent>
              <UpdateComplaintForm complaint={complaint} canViewFinance={data.canViewFinance} />
            </CardContent>
          </Card>
          {tenantPhone && (
            <a
              href={`https://wa.me/${tenantPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              <MessageCircle aria-hidden /> WhatsApp {tenantName}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
