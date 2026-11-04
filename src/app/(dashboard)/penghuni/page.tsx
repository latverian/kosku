import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { asUser } from "@/db";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireContext } from "@/server/actions";
import { listTenants } from "@/services/tenants";

export const metadata: Metadata = { title: "Penghuni" };

export default async function TenantsPage({ searchParams }: PageProps<"/penghuni">) {
  const { tab, q } = await searchParams;
  const alumni = tab === "alumni";
  const query = typeof q === "string" ? q : "";
  const { user, property } = await requireContext();
  const tenants = await asUser(user.id, (tx) => listTenants(tx, property.id, { active: !alumni, q: query }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Penghuni"
        actions={
          <Link href="/penghuni/baru" className={buttonVariants()}>
            <Plus aria-hidden /> Check-in
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Jenis penghuni" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {[
            ["aktif", "Aktif"],
            ["alumni", "Alumni"],
          ].map(([value, label]) => {
            const active = (value === "alumni") === alumni;
            return (
              <Link
                key={value}
                href={value === "alumni" ? "/penghuni?tab=alumni" : "/penghuni"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "grid h-9 place-items-center rounded-md px-4 text-sm font-medium",
                  active ? "bg-card shadow-xs" : "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <form className="relative min-w-0 flex-1 sm:max-w-xs" role="search">
          {alumni && <input type="hidden" name="tab" value="alumni" />}
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={query}
            placeholder="Cari nama atau nomor"
            className="pl-9"
            aria-label="Cari penghuni"
          />
        </form>
      </div>

      {tenants.length === 0 ? (
        <EmptyState>
          {query
            ? "Tidak ada penghuni yang cocok."
            : alumni
              ? "Belum ada alumni."
              : "Belum ada penghuni aktif."}
        </EmptyState>
      ) : (
        <Card className="divide-y overflow-hidden p-0">
          {tenants.map((t) => (
            <Link
              key={t.id}
              href={`/penghuni/${t.id}`}
              className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/60"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold tabular">
                {t.roomCode ?? "—"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.fullName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[
                    t.occupation,
                    t.monthlyRent != null ? `${formatRupiah(t.monthlyRent)}/bln` : null,
                    t.billingDay ? `tagih tgl ${t.billingDay}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
