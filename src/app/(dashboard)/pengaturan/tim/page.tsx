import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminDb, asUser } from "@/db";
import { formatDate } from "@/lib/format";
import { requireContext } from "@/server/actions";
import { getMembership } from "@/server/membership";
import { listMembers, userEmails } from "@/services/team";
import { AddManagerForm, MemberActions } from "./forms";

export const metadata: Metadata = { title: "Tim" };

export default async function TeamPage() {
  const { user, property } = await requireContext();
  const membership = await getMembership(user, property.id);
  const members = await asUser(user.id, (tx) => listMembers(tx, property.id));
  // Email hanya ada di skema auth (koneksi admin); hanya untuk anggota properti ini.
  const emails = await adminDb().transaction((tx) =>
    userEmails(
      tx,
      members.map((m) => m.userId),
    ),
  );
  const isOwner = membership.isOwner || user.preview;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/pengaturan" className="text-sm text-muted-foreground hover:underline">
        ← Pengaturan
      </Link>
      <PageHeader title="Tim pengelola" description={property.name} />
      <Card>
        <CardHeader>
          <CardTitle>Anggota</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {members.length === 0 ? (
            <div className="px-4 pb-2">
              <EmptyState>Belum ada anggota.</EmptyState>
            </div>
          ) : (
            <ul className="divide-y">
              {members.map((m) => (
                <li key={m.userId} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.name || emails.get(m.userId)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {emails.get(m.userId)} · sejak {formatDate(m.since, property.timezone)}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {m.role === "owner"
                        ? "Pemilik"
                        : m.canViewFinance
                          ? "Pengelola + keuangan"
                          : "Pengelola"}
                    </span>
                  </div>
                  {isOwner && m.role === "manager" && (
                    <MemberActions userId={m.userId} canViewFinance={m.canViewFinance} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>Tambah pengelola</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <AddManagerForm />
            <p className="text-xs text-muted-foreground">
              Pengelola bisa mengelola kamar, penghuni, tagihan, pembayaran, komplain, dan pesan WA.
              Pengaturan kos & tim hanya untuk pemilik.
            </p>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Hanya pemilik yang bisa mengubah tim.</p>
      )}
    </div>
  );
}
