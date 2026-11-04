import { Banknote, ChevronRight, CircleAlert, MessageCircleWarning, Plus, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_ICON, STATUS_TONE, StatusBadge, BADGE_LABEL } from "@/components/ui/status-badge";
import { formatDate, formatRupiah, formatRupiahShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth";
import { getActiveProperty, getDashboard, type DashboardData } from "@/server/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const property = await getActiveProperty(user.id);
  if (!property) redirect("/mulai");

  const data = await getDashboard(user.id, property);
  const percent = data.billed > 0 ? Math.round((data.received / data.billed) * 100) : 0;
  const occupancy = data.roomsTotal > 0 ? Math.round((data.roomsOccupied / data.roomsTotal) * 100) : 0;

  return (
    <div className="space-y-4 lg:space-y-6">
      <h1 className="sr-only">Dashboard {property.name}</h1>

      {/* Kartu ringkasan — FR-6.1, FR-6.2 */}
      <section aria-label="Ringkasan bulan ini" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          label="Diterima"
          value={formatRupiahShort(data.received)}
          title={formatRupiah(data.received)}
        >
          <div className="mt-2 flex items-center gap-2">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Persentase tagihan bulan ini yang sudah diterima"
            >
              <div className="h-full rounded-full bg-status-paid" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-xs text-muted-foreground tabular">{percent}%</span>
          </div>
        </StatCard>
        <StatCard
          label="Belum dibayar"
          value={formatRupiahShort(data.unpaidAmount)}
          title={formatRupiah(data.unpaidAmount)}
          hint={`${data.unpaidCount} tagihan bulan ini`}
        />
        <StatCard
          label="Terlambat"
          value={`${data.overdueCount} tagihan`}
          hint={formatRupiah(data.overdueAmount)}
          tone={data.overdueCount > 0 ? "overdue" : undefined}
        />
        <StatCard
          label="Hunian"
          value={`${data.roomsOccupied}/${data.roomsTotal}`}
          hint={`${occupancy}% kamar terisi`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
        <div className="space-y-4">
          <RoomGrid data={data} />
          {/* Aksi utama di HP, sesuai wireframe specs/06 § 4.1 (desktop: menu Pembayaran) */}
          <Link href="/pembayaran/catat" className={cn(buttonVariants({ size: "lg" }), "w-full lg:hidden")}>
            <Plus aria-hidden /> Catat Pembayaran
          </Link>
        </div>
        <ActionList data={data} />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  title,
  tone,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  title?: string;
  tone?: "overdue";
  children?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular lg:text-2xl",
          tone === "overdue" && "text-status-overdue",
        )}
        title={title}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground tabular">{hint}</p>}
      {children}
    </Card>
  );
}

/** Kisi status kamar — FR-6.4 */
function RoomGrid({ data }: { data: DashboardData }) {
  const floors = new Map<number | null, DashboardData["rooms"]>();
  for (const room of data.rooms) {
    floors.set(room.floor, [...(floors.get(room.floor) ?? []), room]);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Status kamar bulan ini</CardTitle>
          <CardDescription>Ketuk kamar untuk melihat detail.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.rooms.length === 0 ? (
          <EmptyState text="Belum ada kamar." />
        ) : (
          [...floors.entries()].map(([floor, rooms]) => (
            <div key={floor ?? "none"}>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {floor != null ? `Lantai ${floor}` : "Tanpa lantai"}
              </p>
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6">
                {rooms.map((room) => (
                  <li key={room.id}>
                    <RoomTile room={room} />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <Legend />
      </CardContent>
    </Card>
  );
}

const ROOM_ONLY: Record<"vacant" | "maintenance", { label: string; className: string }> = {
  vacant: { label: "Kosong", className: "border-dashed bg-transparent text-status-muted" },
  maintenance: { label: "Perbaikan", className: "bg-status-muted-bg text-status-muted" },
};

function RoomTile({ room }: { room: DashboardData["rooms"][number] }) {
  const roomOnly = room.status === "vacant" || room.status === "maintenance" ? ROOM_ONLY[room.status] : null;
  const Icon = roomOnly ? null : STATUS_ICON[room.status as keyof typeof STATUS_ICON];
  const label = roomOnly?.label ?? BADGE_LABEL[room.status as keyof typeof BADGE_LABEL];
  const description = [
    `Kamar ${room.code}`,
    room.tenantName,
    label,
    room.total != null ? formatRupiah(room.total) : null,
    room.dueDate ? `jatuh tempo ${formatDate(room.dueDate)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/kamar/${room.id}`}
      title={description}
      aria-label={description}
      className={cn(
        "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border text-sm font-semibold transition-transform active:scale-95",
        roomOnly
          ? roomOnly.className
          : cn("border-transparent", STATUS_TONE[room.status as keyof typeof STATUS_TONE]),
      )}
    >
      <span className="tabular">{room.code}</span>
      {Icon ? (
        <Icon className="size-4" aria-hidden />
      ) : (
        <span className="text-[10px] font-normal">{roomOnly?.label}</span>
      )}
    </Link>
  );
}

function Legend() {
  const items = ["paid", "upcoming", "pending", "partial", "overdue", "none"] as const;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5 border-t pt-3" aria-label="Keterangan warna">
      {items.map((status) => (
        <li key={status}>
          <StatusBadge status={status} />
        </li>
      ))}
    </ul>
  );
}

/** Daftar perlu tindakan — FR-6.3, aksi cepat FR-6.7 */
function ActionList({ data }: { data: DashboardData }) {
  const total =
    data.pendingPayments.length +
    data.overdueInvoices.length +
    data.complaints.length +
    (data.failedMessages > 0 ? 1 : 0);

  return (
    <Card className="self-start">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Perlu tindakan</CardTitle>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular">{total}</span>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        {total === 0 ? (
          <div className="px-4 pb-2">
            <EmptyState text="Semua beres. Tidak ada yang perlu ditindaklanjuti 🎉" />
          </div>
        ) : (
          <ul className="divide-y">
            {data.pendingPayments.map((p) => (
              <ActionRow
                key={p.id}
                icon={<Banknote className="text-status-pending" aria-hidden />}
                title={`Bukti bayar Kamar ${p.roomCode}`}
                subtitle={`${p.tenantName} · ${formatRupiah(p.amount)}`}
                href="/pembayaran"
                cta="Cek"
              />
            ))}
            {data.overdueInvoices.map((inv) => (
              <ActionRow
                key={inv.id}
                icon={<CircleAlert className="text-status-overdue" aria-hidden />}
                title={`Kamar ${inv.roomCode} telat ${inv.daysLate} hari`}
                subtitle={`${inv.tenantName} · sisa ${formatRupiah(inv.remaining)}`}
                href={waLink(
                  inv.phone,
                  `Halo ${inv.tenantName}, sewa kamar ${inv.roomCode} sudah lewat jatuh tempo ${inv.daysLate} hari. Sisa tagihan ${formatRupiah(inv.remaining)}. Mohon segera diselesaikan ya, terima kasih 🙏`,
                )}
                cta="WA"
                external
              />
            ))}
            {data.complaints.map((c) => (
              <ActionRow
                key={c.id}
                icon={
                  <Wrench
                    className={
                      c.priority === "urgent" || c.priority === "high"
                        ? "text-status-overdue"
                        : "text-muted-foreground"
                    }
                    aria-hidden
                  />
                }
                title={`#${c.number} ${c.title}`}
                subtitle={`${c.place} · ${PRIORITY_LABEL[c.priority] ?? c.priority} · ${c.status === "open" ? "Baru" : "Diproses"}`}
                href={`/komplain/${c.id}`}
              />
            ))}
            {data.failedMessages > 0 && (
              <ActionRow
                icon={<MessageCircleWarning className="text-status-overdue" aria-hidden />}
                title={`${data.failedMessages} pesan WA gagal terkirim`}
                subtitle="Kirim ulang dari halaman Pesan WA"
                href="/pesan"
              />
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const PRIORITY_LABEL: Record<string, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  urgent: "Darurat",
};

function ActionRow({
  icon,
  title,
  subtitle,
  href,
  cta,
  external,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href: string;
  cta?: string;
  external?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-muted/60 [&_svg]:size-5 [&_svg]:shrink-0"
      >
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-muted-foreground tabular">{subtitle}</span>
        </span>
        {cta ? (
          <span className="rounded-md border px-2.5 py-1 text-xs font-medium">{cta}</span>
        ) : (
          <ChevronRight className="text-muted-foreground" aria-hidden />
        )}
      </Link>
    </li>
  );
}

function waLink(phone: string, text: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</p>
  );
}
