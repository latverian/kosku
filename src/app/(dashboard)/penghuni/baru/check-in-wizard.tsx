"use client";

import { Check } from "lucide-react";
import { useActionState, useMemo, useRef, useState } from "react";
import { Field, FormAlert, SubmitButton, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { defaultBillingDay, planInvoices } from "@/lib/billing";
import { addDays } from "@/lib/billing/dates";
import { formatDate, formatRupiah } from "@/lib/format";
import { parseRupiah } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { checkInAction } from "../actions";

type Room = {
  id: string;
  code: string;
  floor: number | null;
  type: string | null;
  monthlyPrice: number;
  depositAmount: number;
};

const STEPS = ["Pilih kamar", "Data penghuni", "Sewa"] as const;
const FIELD_STEP: Record<string, number> = {
  roomId: 0,
  fullName: 1,
  phone: 1,
  email: 1,
  nik: 1,
  occupation: 1,
  emergencyName: 1,
  emergencyRelation: 1,
  emergencyPhone: 1,
  notes: 1,
};

const fmt = (n: number) => (n ? n.toLocaleString("id-ID") : "");

export function CheckInWizard({
  rooms,
  preselectedRoomId,
  today,
  settings,
  nikEnabled,
}: {
  rooms: Room[];
  preselectedRoomId: string | null;
  today: string;
  settings: { prorateFirstMonth: boolean; invoiceLeadDays: number };
  nikEnabled: boolean;
}) {
  const [state, action] = useActionState(checkInAction, undefined);
  const [step, setStep] = useState(preselectedRoomId ? 1 : 0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const v = state?.values;

  const initialRoom = rooms.find((r) => r.id === (v?.roomId ?? preselectedRoomId)) ?? null;
  const [roomId, setRoomId] = useState(initialRoom?.id ?? "");
  const [rent, setRent] = useState(v?.monthlyRent ?? fmt(initialRoom?.monthlyPrice ?? 0));
  const [deposit, setDeposit] = useState(v?.depositAmount ?? fmt(initialRoom?.depositAmount ?? 0));
  const [startDate, setStartDate] = useState(v?.startDate ?? today);
  const [billingDay, setBillingDay] = useState(v?.billingDay ?? String(defaultBillingDay(today)));
  const [billingDayTouched, setBillingDayTouched] = useState(Boolean(v?.billingDay));
  const [existing, setExisting] = useState(v?.existingTenant === "on");
  const [billingStartMonth, setBillingStartMonth] = useState(v?.billingStartMonth ?? today.slice(0, 7));

  // Lompat ke langkah yang berisi field error pertama (disesuaikan saat render, tanpa effect)
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    const first = Object.keys(state?.fieldErrors ?? {})[0];
    if (first) setStep(FIELD_STEP[first] ?? 2);
  }

  const selectRoom = (room: Room) => {
    setRoomId(room.id);
    setRent(fmt(room.monthlyPrice));
    setDeposit(fmt(room.depositAmount));
  };

  const preview = useMemo(() => {
    const monthlyRent = parseRupiah(rent);
    const day = Number(billingDay);
    if (!monthlyRent || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !(day >= 1 && day <= 28)) return null;
    const [first] = planInvoices(
      {
        startDate,
        endDate: null,
        billingDay: day,
        monthlyRent,
        billingStartPeriod:
          existing && /^\d{4}-\d{2}$/.test(billingStartMonth) ? `${billingStartMonth}-01` : null,
      },
      { invoiceLeadDays: 400, prorateFirstMonth: settings.prorateFirstMonth },
      // rencana sampai jauh ke depan cukup untuk melihat tagihan pertama
      startDate > today ? startDate : today,
    );
    return first ?? null;
  }, [rent, billingDay, startDate, existing, billingStartMonth, settings.prorateFirstMonth, today]);

  const next = () => {
    const container = stepRefs.current[step];
    const inputs = container?.querySelectorAll<HTMLInputElement>("input, select, textarea") ?? [];
    for (const input of inputs) {
      if (!input.checkValidity()) {
        input.reportValidity();
        return;
      }
    }
    if (step === 0 && !roomId) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <form action={action} className="space-y-5" noValidate>
      <ol className="grid grid-cols-3 gap-2" aria-label="Langkah">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              aria-current={step === i ? "step" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium sm:text-sm",
                step === i
                  ? "border-primary bg-accent text-accent-foreground"
                  : i < step
                    ? "bg-card"
                    : "bg-card text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs",
                  i < step
                    ? "bg-status-paid text-white"
                    : step === i
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                )}
              >
                {i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className="truncate">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {/* Langkah 1 — Kamar */}
      <div
        ref={(el) => {
          stepRefs.current[0] = el;
        }}
        hidden={step !== 0}
        className="space-y-3"
      >
        <input type="hidden" name="roomId" value={roomId} />
        {rooms.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Tidak ada kamar kosong.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Kamar kosong">
            {rooms.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={roomId === room.id}
                  onClick={() => selectRoom(room)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-3 text-left",
                    roomId === room.id
                      ? "border-primary ring-2 ring-primary/30"
                      : "bg-card hover:bg-muted/60",
                  )}
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted font-semibold tabular">
                    {room.code}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{formatRupiah(room.monthlyPrice)}/bln</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[room.type, room.floor != null ? `Lantai ${room.floor}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {state?.fieldErrors?.roomId && (
          <p className="text-xs text-status-overdue">{state.fieldErrors.roomId}</p>
        )}
      </div>

      {/* Langkah 2 — Data penghuni */}
      <div
        ref={(el) => {
          stepRefs.current[1] = el;
        }}
        hidden={step !== 1}
        className="space-y-4"
      >
        <TextField label="Nama lengkap" name="fullName" state={state} autoComplete="off" required />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="No. WhatsApp"
            name="phone"
            state={state}
            inputMode="tel"
            placeholder="0812 3456 7890"
            required
            hint="Untuk pengingat tagihan."
          />
          <TextField label="Email" name="email" state={state} type="email" inputMode="email" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="NIK"
            name="nik"
            state={state}
            inputMode="numeric"
            maxLength={20}
            disabled={!nikEnabled}
            hint={
              nikEnabled
                ? "Disimpan terenkripsi. Tampil tersamar."
                : "Belum aktif: NIK_ENCRYPTION_KEY belum diatur."
            }
          />
          <TextField label="Pekerjaan / kampus" name="occupation" state={state} />
        </div>
        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-medium">Kontak darurat</legend>
          <TextField label="Nama" name="emergencyName" state={state} />
          <TextField label="Hubungan" name="emergencyRelation" state={state} placeholder="Orang tua" />
          <TextField label="No. HP" name="emergencyPhone" state={state} inputMode="tel" />
        </fieldset>
        <Field label="Catatan" name="notes" state={state}>
          <Textarea id="notes" name="notes" rows={2} defaultValue={v?.notes ?? ""} />
        </Field>
        <p className="text-xs text-muted-foreground">
          Upload foto KTP tersedia di Fase 2 bersama portal penghuni.
        </p>
      </div>

      {/* Langkah 3 — Sewa */}
      <div
        ref={(el) => {
          stepRefs.current[2] = el;
        }}
        hidden={step !== 2}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal masuk" name="startDate" state={state}>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              required
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (!billingDayTouched && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
                  setBillingDay(String(defaultBillingDay(e.target.value)));
                }
              }}
            />
          </Field>
          <Field
            label="Tanggal tagih setiap bulan"
            name="billingDay"
            state={state}
            hint="1–28. Default mengikuti tanggal masuk."
          >
            <Input
              id="billingDay"
              name="billingDay"
              type="number"
              min={1}
              max={28}
              required
              value={billingDay}
              onChange={(e) => {
                setBillingDay(e.target.value);
                setBillingDayTouched(true);
              }}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Harga sewa per bulan (Rp)" name="monthlyRent" state={state}>
            <Input
              id="monthlyRent"
              name="monthlyRent"
              inputMode="numeric"
              required
              value={rent}
              onChange={(e) => setRent(e.target.value)}
            />
          </Field>
          <Field label="Deposit (Rp)" name="depositAmount" state={state}>
            <Input
              id="depositAmount"
              name="depositAmount"
              inputMode="numeric"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </Field>
        </div>
        <TextField
          label="Kontrak sampai (opsional)"
          name="endDate"
          state={state}
          type="date"
          className="sm:max-w-xs"
        />

        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <input
            type="checkbox"
            name="existingTenant"
            checked={existing}
            onChange={(e) => setExisting(e.target.checked)}
            className="mt-0.5 size-5 accent-[var(--primary)]"
          />
          <span>
            <span className="font-medium">Penghuni lama (sudah tinggal sebelum pakai Kosku)</span>
            <span className="block text-muted-foreground">
              Tagihan bulan-bulan sebelumnya tidak akan dibuat.
            </span>
          </span>
        </label>
        {existing && (
          <Field
            label="Mulai ditagih dari bulan"
            name="billingStartMonth"
            state={state}
            className="sm:max-w-xs"
          >
            <Input
              id="billingStartMonth"
              name="billingStartMonth"
              type="month"
              value={billingStartMonth}
              onChange={(e) => setBillingStartMonth(e.target.value)}
            />
          </Field>
        )}

        {preview && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">Tagihan pertama</p>
            <p className="tabular">
              {formatRupiah(preview.rent)} · jatuh tempo {formatDate(preview.dueDate)}
            </p>
            <p className="text-xs text-muted-foreground">
              Menutup {formatDate(preview.coversFrom)} – {formatDate(addDays(preview.coversTo, -1))}
              {preview.prorated ? " (prorata)" : ""}. Tagihan berikutnya dibuat otomatis{" "}
              {settings.invoiceLeadDays} hari sebelum jatuh tempo.
            </p>
          </div>
        )}
      </div>

      <FormAlert state={state} />

      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          ← Kembali
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next} disabled={step === 0 && !roomId}>
            Lanjut →
          </Button>
        ) : (
          <SubmitButton pendingText="Menyimpan…">Simpan check-in ✓</SubmitButton>
        )}
      </div>
    </form>
  );
}
