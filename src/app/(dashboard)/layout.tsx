import { FlaskConical } from "lucide-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { formatPeriod } from "@/lib/format";
import { periodOf, todayIn } from "@/lib/billing";
import { getCurrentUser } from "@/server/auth";
import { getActiveProperty, listMyProperties } from "@/server/dashboard";
import { getMembership } from "@/server/membership";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  const property = await getActiveProperty(user.id);
  const properties = await listMyProperties(user.id);
  const membership = property ? await getMembership(user, property.id) : null;
  const canViewFinance = user.preview || Boolean(membership?.canViewFinance);
  const periodLabel = formatPeriod(periodOf(todayIn(property?.timezone ?? "Asia/Jakarta")));

  return (
    <div className="flex min-h-dvh">
      <Sidebar canViewFinance={canViewFinance} />
      <div className="flex min-w-0 flex-1 flex-col">
        {user.preview && (
          <p className="flex items-center justify-center gap-2 bg-status-pending-bg px-4 py-1.5 text-center text-xs text-status-pending">
            <FlaskConical className="size-3.5" aria-hidden />
            Mode pratinjau development: login dilewati karena Supabase belum dikonfigurasi.
          </p>
        )}
        <TopBar
          properties={properties.map((p) => ({ id: p.id, name: p.name }))}
          activeId={property?.id ?? null}
          periodLabel={periodLabel}
          userName={user.name}
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-24 lg:px-6 lg:pb-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
