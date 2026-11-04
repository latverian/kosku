import Link from "next/link";
import { PortalInvalid } from "@/components/portal-invalid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminDb } from "@/db";
import { formatDate } from "@/lib/format";
import { getPortal } from "@/server/portal";
import { signedUrl } from "@/server/uploads";
import { CATEGORY_LABEL, getComplaintDetail, STATUS_LABEL } from "@/services/complaints";
import { CommentForm, RatingForm } from "../../forms";

export default async function PortalComplaintPage({
  params,
  searchParams,
}: PageProps<"/p/[token]/komplain/[id]">) {
  const { token, id } = await params;
  const sp = await searchParams;
  const portal = await getPortal(token);
  if (!portal || !/^[0-9a-f-]{36}$/.test(id)) return <PortalInvalid />;
  const detail = await adminDb().transaction((tx) => getComplaintDetail(tx, id));
  // Hanya komplain milik penghuni ini
  if (!detail || detail.complaint.tenantId !== portal.tenantId) return <PortalInvalid />;
  const { complaint, updates, photos } = detail;
  const photoUrls = await Promise.all(photos.map((p) => signedUrl("complaint-photos", p.path)));

  return (
    <>
      <Link href={`/p/${token}`} className="text-sm text-muted-foreground hover:underline">
        ← Kembali
      </Link>
      {sp.baru === "1" && (
        <p role="status" className="rounded-lg bg-status-paid-bg p-3 text-sm text-status-paid">
          Laporan terkirim ✅ Kamu akan dapat kabar lewat WhatsApp saat ada perkembangan.
        </p>
      )}
      <Card>
        <CardHeader>
          <p className="text-xs text-muted-foreground">
            #{complaint.number} · {CATEGORY_LABEL[complaint.category]} ·{" "}
            {formatDate(complaint.createdAt, portal.timezone)}
          </p>
          <CardTitle className="text-lg">{complaint.title}</CardTitle>
          <p className="text-sm font-medium">Status: {STATUS_LABEL[complaint.status]}</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {complaint.description && <p className="whitespace-pre-line">{complaint.description}</p>}
          {photoUrls.some(Boolean) && (
            <div className="grid grid-cols-3 gap-2">
              {photoUrls.map((url, i) =>
                url ? (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL bertanda tangan berumur pendek, tidak cocok untuk optimasi next/image */}
                    <img
                      src={url}
                      alt={`Foto ${i + 1}`}
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  </a>
                ) : null,
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Percakapan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="space-y-2 text-sm">
            {updates.map(({ update }) => (
              <li
                key={update.id}
                className={
                  update.authorType === "tenant"
                    ? "ml-8 rounded-lg bg-accent p-2.5"
                    : "mr-8 rounded-lg bg-muted p-2.5"
                }
              >
                <p className="text-xs text-muted-foreground">
                  {update.authorType === "tenant" ? "Kamu" : "Pengelola"} ·{" "}
                  {formatDate(update.createdAt, portal.timezone)}
                </p>
                {update.toStatus && <p className="font-medium">Status: {STATUS_LABEL[update.toStatus]}</p>}
                {update.body && <p className="whitespace-pre-line">{update.body}</p>}
              </li>
            ))}
          </ol>
          {complaint.status !== "resolved" && complaint.status !== "rejected" && (
            <CommentForm token={token} complaintId={complaint.id} />
          )}
          {complaint.status === "resolved" && (
            <RatingForm token={token} complaintId={complaint.id} current={complaint.rating} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
