import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asUser } from "@/db";
import { formatDate } from "@/lib/format";
import { TEMPLATE_LABEL, type TemplateType } from "@/lib/messaging/templates";
import { cn } from "@/lib/utils";
import { requireContext } from "@/server/actions";
import { listMessages, messageCounts, templateFor } from "@/services/messaging";
import { getProperty, getSettings } from "@/services/properties";
import {
  BroadcastForm,
  ReminderSettingsForm,
  ResendButton,
  SendNowButton,
  SendTestForm,
  TemplateEditor,
} from "./forms";

export const metadata: Metadata = { title: "Pesan WA" };

const TABS = [
  { value: "log", label: "Log pesan" },
  { value: "template", label: "Template" },
  { value: "broadcast", label: "Pengumuman" },
  { value: "pengaturan", label: "Pengaturan" },
] as const;

const STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: "Antri", tone: "bg-status-upcoming-bg text-status-upcoming" },
  sending: { label: "Mengirim", tone: "bg-status-upcoming-bg text-status-upcoming" },
  sent: { label: "Terkirim", tone: "bg-status-paid-bg text-status-paid" },
  delivered: { label: "Diterima", tone: "bg-status-paid-bg text-status-paid" },
  read: { label: "Dibaca", tone: "bg-status-paid-bg text-status-paid" },
  failed: { label: "Gagal", tone: "bg-status-overdue-bg text-status-overdue" },
  skipped: { label: "Dilewati", tone: "bg-status-muted-bg text-status-muted" },
};

const TYPE_LABEL: Record<string, string> = {
  ...TEMPLATE_LABEL,
  broadcast: "Pengumuman",
  manual: "Manual",
};

function providerStatus() {
  if (process.env.FONNTE_TOKEN) return { label: "Fonnte terhubung", tone: "text-status-paid" };
  if (process.env.NODE_ENV === "production")
    return { label: "Belum dikonfigurasi: isi FONNTE_TOKEN", tone: "text-status-overdue" };
  return {
    label: "Mode development: pesan hanya dicetak di log server (tidak dikirim)",
    tone: "text-status-pending",
  };
}

export default async function MessagesPage({ searchParams }: PageProps<"/pesan">) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.value === sp.tab)?.value ?? "log";
  const filter = sp.status === "failed" || sp.status === "queued" ? sp.status : undefined;
  const { user, property } = await requireContext();
  const provider = providerStatus();

  const data = await asUser(user.id, async (tx) => {
    if (tab === "log")
      return {
        kind: "log" as const,
        messages: await listMessages(tx, property.id, { status: filter }),
        counts: await messageCounts(tx, property.id),
      };
    if (tab === "template") {
      const types = Object.keys(TEMPLATE_LABEL) as TemplateType[];
      return {
        kind: "template" as const,
        templates: await Promise.all(
          types.map(async (type) => ({ type, ...(await templateFor(tx, property.id, type)) })),
        ),
      };
    }
    if (tab === "pengaturan")
      return {
        kind: "pengaturan" as const,
        settings: await getSettings(tx, property.id),
        detail: await getProperty(tx, property.id),
      };
    return { kind: "broadcast" as const };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pesan WhatsApp"
        description={<span className={provider.tone}>{provider.label}</span>}
        actions={tab === "log" ? <SendNowButton /> : undefined}
      />
      <nav aria-label="Bagian" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "log" ? "/pesan" : `/pesan?tab=${t.value}`}
            aria-current={tab === t.value ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm",
              tab === t.value
                ? "border-primary bg-accent text-accent-foreground"
                : "bg-card text-muted-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {data.kind === "log" && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            {[
              [undefined, `Semua`],
              ["queued", `Antri (${(data.counts.queued ?? 0) + (data.counts.sending ?? 0)})`],
              ["failed", `Gagal (${data.counts.failed ?? 0})`],
            ].map(([value, label]) => (
              <Link
                key={label}
                href={value ? `/pesan?status=${value}` : "/pesan"}
                className={cn(
                  "rounded-md px-2 py-1",
                  filter === value ? "bg-muted font-medium" : "text-muted-foreground hover:underline",
                )}
              >
                {label}
              </Link>
            ))}
          </div>
          {data.messages.length === 0 ? (
            <EmptyState>Belum ada pesan.</EmptyState>
          ) : (
            <Card className="divide-y overflow-hidden p-0">
              {data.messages.map((m) => (
                <details key={m.id} className="group">
                  <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/60">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {m.tenantName ?? m.toPhone}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {TYPE_LABEL[m.type] ?? m.type}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {m.status === "sent" && m.sentAt
                          ? `Terkirim ${formatDate(m.sentAt, property.timezone)}`
                          : m.status === "queued"
                            ? `Dijadwalkan ${new Date(m.scheduledAt).toLocaleString("id-ID", { timeZone: property.timezone, dateStyle: "medium", timeStyle: "short" })}`
                            : (m.error ?? formatDate(m.createdAt, property.timezone))}
                      </span>
                    </span>
                    <span
                      className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS[m.status]?.tone)}
                    >
                      {STATUS[m.status]?.label ?? m.status}
                    </span>
                  </summary>
                  <div className="space-y-2 bg-muted/40 px-4 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">
                      Ke {m.toPhone} · percobaan {m.attempts}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    {(m.status === "failed" || m.status === "skipped") && <ResendButton messageId={m.id} />}
                  </div>
                </details>
              ))}
            </Card>
          )}
        </>
      )}

      {data.kind === "template" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Ketuk template untuk mengubah. Pratinjau memakai contoh data.
          </p>
          {data.templates.map((t) => (
            <TemplateEditor
              key={t.type}
              type={t.type}
              label={TEMPLATE_LABEL[t.type]}
              body={t.body}
              enabled={t.enabled}
            />
          ))}
        </div>
      )}

      {data.kind === "broadcast" && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Kirim pengumuman</CardTitle>
            <CardDescription>
              Dikirim ke WhatsApp setiap penghuni aktif, dengan jeda antar pesan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BroadcastForm />
          </CardContent>
        </Card>
      )}

      {data.kind === "pengaturan" && (
        <div className="grid max-w-3xl gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Pengingat otomatis</CardTitle>
            </CardHeader>
            <CardContent>
              <ReminderSettingsForm settings={data.settings} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Uji koneksi WhatsApp</CardTitle>
              <CardDescription>
                Notifikasi untuk pengelola (komplain baru, bukti bayar) dikirim ke No. WA pengelola di{" "}
                <Link href="/pengaturan" className="text-primary hover:underline">
                  Pengaturan
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SendTestForm defaultPhone={data.detail.contactPhone} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
