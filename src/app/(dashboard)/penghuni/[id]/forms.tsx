"use client";

import { useActionState, useState } from "react";
import { Field, FormAlert, MoneyField, SubmitButton, TextField } from "@/components/forms";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import { checkOutAction, moveRoomAction, updateTenantAction } from "../actions";

type Tenant = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  nikLast4: string | null;
  occupation: string | null;
  emergencyName: string | null;
  emergencyRelation: string | null;
  emergencyPhone: string | null;
  notes: string | null;
};

const localPhone = (p: string | null) => (p ? `0${p.slice(2)}` : "");

export function EditTenantForm({ tenant, nikEnabled }: { tenant: Tenant; nikEnabled: boolean }) {
  const [state, action] = useActionState(updateTenantAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenantId" value={tenant.id} />
      <TextField label="Nama lengkap" name="fullName" state={state} defaultValue={tenant.fullName} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="No. WhatsApp"
          name="phone"
          state={state}
          inputMode="tel"
          defaultValue={localPhone(tenant.phone)}
          required
        />
        <TextField label="Email" name="email" state={state} type="email" defaultValue={tenant.email ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="NIK"
          name="nik"
          state={state}
          inputMode="numeric"
          disabled={!nikEnabled}
          placeholder={tenant.nikLast4 ? `************${tenant.nikLast4} (isi untuk mengganti)` : ""}
          hint={
            nikEnabled
              ? "Kosongkan agar NIK tersimpan tidak berubah."
              : "Belum aktif: NIK_ENCRYPTION_KEY belum diatur."
          }
        />
        <TextField
          label="Pekerjaan / kampus"
          name="occupation"
          state={state}
          defaultValue={tenant.occupation ?? ""}
        />
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Kontak darurat</legend>
        <TextField
          label="Nama"
          name="emergencyName"
          state={state}
          defaultValue={tenant.emergencyName ?? ""}
        />
        <TextField
          label="Hubungan"
          name="emergencyRelation"
          state={state}
          defaultValue={tenant.emergencyRelation ?? ""}
        />
        <TextField
          label="No. HP"
          name="emergencyPhone"
          state={state}
          inputMode="tel"
          defaultValue={localPhone(tenant.emergencyPhone)}
        />
      </fieldset>
      <Field label="Catatan" name="notes" state={state}>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={state?.values?.notes ?? tenant.notes ?? ""}
        />
      </Field>
      <FormAlert state={state} />
      <SubmitButton>Simpan</SubmitButton>
    </form>
  );
}

export function CheckOutForm({
  tenantId,
  leaseId,
  depositAmount,
  today,
}: {
  tenantId: string;
  leaseId: string;
  depositAmount: number;
  today: string;
}) {
  const [state, action] = useActionState(checkOutAction, undefined);
  const [deposit, setDeposit] = useState(depositAmount > 0 ? "refunded" : "held");
  return (
    <form
      action={action}
      className="space-y-4"
      onSubmit={(e) => {
        if (
          !confirm(
            "Lakukan check-out? Kamar akan menjadi kosong dan tagihan setelah tanggal keluar dibatalkan.",
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="leaseId" value={leaseId} />
      <TextField
        label="Tanggal keluar"
        name="endDate"
        state={state}
        type="date"
        defaultValue={today}
        required
        className="sm:max-w-xs"
      />
      <TextField
        label="Alasan (opsional)"
        name="reason"
        state={state}
        placeholder="Lulus kuliah, pindah kerja, …"
      />
      {depositAmount > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Deposit ${formatRupiah(depositAmount)}`} name="depositStatus" state={state}>
            <Select
              id="depositStatus"
              name="depositStatus"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            >
              <option value="refunded">Dikembalikan penuh</option>
              <option value="partial_refund">Dikembalikan sebagian</option>
              <option value="forfeited">Hangus</option>
              <option value="held">Belum diputuskan</option>
            </Select>
          </Field>
          {deposit === "partial_refund" && (
            <MoneyField label="Nominal dikembalikan (Rp)" name="depositRefunded" state={state} />
          )}
        </div>
      ) : (
        <input type="hidden" name="depositStatus" value="held" />
      )}
      <p className="text-xs text-muted-foreground">
        Tagihan yang belum lunas sebelum tanggal keluar tetap tercatat sebagai tunggakan.
      </p>
      <FormAlert state={state} />
      <SubmitButton variant="destructive" pendingText="Memproses…">
        Check-out
      </SubmitButton>
    </form>
  );
}

export function MoveRoomForm({
  tenantId,
  leaseId,
  rooms,
  today,
}: {
  tenantId: string;
  leaseId: string;
  rooms: { id: string; code: string; monthlyPrice: number; type: string | null }[];
  today: string;
}) {
  const [state, action] = useActionState(moveRoomAction, undefined);
  const [roomId, setRoomId] = useState("");
  const [rent, setRent] = useState("");
  if (rooms.length === 0)
    return <p className="text-sm text-muted-foreground">Tidak ada kamar kosong untuk pindah.</p>;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="leaseId" value={leaseId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Kamar tujuan" name="newRoomId" state={state}>
          <Select
            id="newRoomId"
            name="newRoomId"
            value={roomId}
            required
            onChange={(e) => {
              setRoomId(e.target.value);
              const room = rooms.find((r) => r.id === e.target.value);
              if (room) setRent(room.monthlyPrice.toLocaleString("id-ID"));
            }}
          >
            <option value="">Pilih kamar</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {formatRupiah(r.monthlyPrice)}
                {r.type ? ` · ${r.type}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <TextField
          label="Tanggal pindah"
          name="moveDate"
          state={state}
          type="date"
          defaultValue={today}
          required
        />
        <Field label="Harga sewa baru (Rp)" name="monthlyRent" state={state}>
          <input
            id="monthlyRent"
            name="monthlyRent"
            inputMode="numeric"
            value={rent}
            onChange={(e) => setRent(e.target.value)}
            required
            className="h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Deposit ikut pindah. Tagihan siklus berjalan tetap di kamar lama; kamar baru ditagih mulai siklus
        berikutnya.
      </p>
      <FormAlert state={state} />
      <SubmitButton pendingText="Memproses…">Pindahkan</SubmitButton>
    </form>
  );
}
