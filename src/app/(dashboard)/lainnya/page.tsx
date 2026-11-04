import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { MOBILE_PRIMARY, NAV_ITEMS } from "@/components/layout/nav-items";
import { requireContext } from "@/server/actions";
import { getMembership } from "@/server/membership";

export const metadata: Metadata = { title: "Lainnya" };

/** Menu tambahan untuk navigasi bawah di HP. */
export default async function MorePage() {
  const { user, property } = await requireContext();
  const { canViewFinance } = await getMembership(user, property.id);
  const items = NAV_ITEMS.filter(
    (item) => !MOBILE_PRIMARY.includes(item.href) && (!item.ownerOnly || canViewFinance || user.preview),
  );
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Lainnya</h1>
      <Card className="divide-y overflow-hidden p-0">
        {items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex h-14 items-center gap-3 px-4 hover:bg-muted/60">
            <Icon className="size-5 text-muted-foreground" aria-hidden />
            <span className="flex-1 font-medium">{label}</span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </Card>
    </div>
  );
}
