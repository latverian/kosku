"use client";

import { useActionState, useState } from "react";
import { Field, FormAlert, MoneyField, SubmitButton, TextField } from "@/components/forms";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { BankAccount } from "@/db/schema";
import { updatePropertyAction, updateSettingsAction } from "./actions";

export function PropertyForm({
  property,
}: {
  property: {
    name: string;
    code: string;
    address: string | null;
    contactPhone: string | null;
    rules: string | null;
  };
}) {
  const [state, action] = useActionState(updatePropertyAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <TextField label="Nama kos" name="name" state={state} defaultValue={property.name} required />
        <TextField label="Kode" name="code" defaultValue={property.code} disabled hint="Tidak bisa diubah" />
      </div>
      <TextField label="Alamat" name="address" state={state} defaultValue={property.address ?? ""} />
      <TextField
        label="No. WA pengelola"
        name="contactPhone"
        state={state}
        inputMode="tel"
        defaultValue={property.contactPhone ? `0${property.contactPhone.slice(2)}` : ""}
        hint="Ditampilkan ke penghuni di portal."
      />
      <Field label="Aturan kos" name="rules" state={state} hint="Tampil di portal penghuni (Fase 2).">
        <Textarea
          id="rules"
          name="rules"
          rows={4}
          defaultValue={state?.values?.rules ?? property.rules ?? ""}
        />
      </Field>
      <FormAlert state={state} />
      <SubmitButton>Simpan data kos</SubmitButton>
    </form>
  );
}

type Settings = {
  invoiceLeadDays: number;
  prorateFirstMonth: boolean;
  lateFeeType: string;
  lateFeeAmount: number;
  lateFeeMax: number | null;
  lateFeeGraceDays: number;
  bankAccounts: BankAccount[];
};

const fmt = (n: number | null) => (n ? n.toLocaleString("id-ID") : "");

export function SettingsForm({ settings, highlightBank }: { settings: Settings; highlightBank?: boolean }) {
  const [state, action] = useActionState(updateSettingsAction, undefined);
  const [lateFeeType, setLateFeeType] = useState(settings.lateFeeType);
  const accounts = [0, 1, 2].map((i) => settings.bankAccounts[i] ?? { bank: "", number: "", holder: "" });
  const v = state?.values;

  return (
    <form action={action} className="space-y-6">
      <fieldset
        className={
          highlightBank
            ? "space-y-3 rounded-lg ring-2 ring-primary/40 ring-offset-4 ring-offset-card"
            : "space-y-3"
        }
      >
        <legend className="mb-1 font-medium">Rekening tujuan transfer</legend>
        <p className="text-sm text-muted-foreground">
          Ditampilkan di tagihan & pengingat WA. Maksimal 3 rekening.
        </p>
        {accounts.map((a, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr]">
            <TextField
              label={`Bank ${i + 1}`}
              name={`bank_${i}`}
              defaultValue={v?.[`bank_${i}`] ?? a.bank}
              placeholder="BCA"
            />
            <TextField
              label="Nomor rekening"
              name={`number_${i}`}
              defaultValue={v?.[`number_${i}`] ?? a.number}
              inputMode="numeric"
            />
            <TextField label="Atas nama" name={`holder_${i}`} defaultValue={v?.[`holder_${i}`] ?? a.holder} />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 font-medium">Tagihan</legend>
        <TextField
          label="Buat tagihan berapa hari sebelum jatuh tempo"
          name="invoiceLeadDays"
          state={state}
          type="number"
          min={0}
          max={28}
          defaultValue={settings.invoiceLeadDays}
          className="max-w-xs"
        />
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="prorateFirstMonth"
            defaultChecked={settings.prorateFirstMonth}
            className="mt-0.5 size-5 accent-[var(--primary)]"
          />
          <span>
            <span className="font-medium">Prorata bulan pertama</span>
            <span className="block text-muted-foreground">
              Jika penghuni masuk tidak di tanggal tagih, bulan pertama dihitung sesuai sisa hari. Jika
              dimatikan, bulan pertama ditagih penuh.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 font-medium">Denda keterlambatan</legend>
        <p className="text-sm text-muted-foreground">Disimpan sekarang, diterapkan otomatis mulai Fase 2.</p>
        <Field label="Jenis denda" name="lateFeeType" state={state} className="max-w-xs">
          <Select
            id="lateFeeType"
            name="lateFeeType"
            value={lateFeeType}
            onChange={(e) => setLateFeeType(e.target.value)}
          >
            <option value="none">Tanpa denda</option>
            <option value="fixed">Nominal tetap (sekali)</option>
            <option value="daily">Per hari</option>
          </Select>
        </Field>
        {lateFeeType !== "none" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <MoneyField
              label={lateFeeType === "daily" ? "Denda per hari (Rp)" : "Denda (Rp)"}
              name="lateFeeAmount"
              state={state}
              defaultValue={fmt(settings.lateFeeAmount)}
            />
            {lateFeeType === "daily" && (
              <MoneyField
                label="Maksimum denda (Rp)"
                name="lateFeeMax"
                state={state}
                defaultValue={fmt(settings.lateFeeMax)}
                hint="Kosongkan jika tanpa batas"
              />
            )}
            <TextField
              label="Masa tenggang (hari)"
              name="lateFeeGraceDays"
              state={state}
              type="number"
              min={0}
              max={30}
              defaultValue={settings.lateFeeGraceDays}
            />
          </div>
        )}
        {lateFeeType === "none" && (
          <input type="hidden" name="lateFeeGraceDays" value={settings.lateFeeGraceDays} />
        )}
      </fieldset>

      <FormAlert state={state} />
      <SubmitButton>Simpan pengaturan</SubmitButton>
    </form>
  );
}
