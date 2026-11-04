"use client";

import { useActionState } from "react";
import { Field, FormAlert, MoneyField, SubmitButton, TextField } from "@/components/forms";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { staffCommentAction, staffCreateComplaintAction, updateComplaintAction } from "./actions";

const STATUS = [
  ["open", "Baru"],
  ["in_progress", "Diproses"],
  ["resolved", "Selesai"],
  ["rejected", "Ditolak"],
] as const;
const PRIORITY = [
  ["low", "Rendah"],
  ["medium", "Sedang"],
  ["high", "Tinggi"],
  ["urgent", "Darurat"],
] as const;
const CATEGORY = [
  ["ac", "AC"],
  ["electricity", "Listrik"],
  ["water", "Air"],
  ["internet", "Internet / WiFi"],
  ["cleanliness", "Kebersihan"],
  ["facility", "Fasilitas"],
  ["security", "Keamanan"],
  ["neighbor", "Tetangga / kebisingan"],
  ["other", "Lainnya"],
] as const;

export function UpdateComplaintForm({
  complaint,
  canViewFinance,
}: {
  complaint: {
    id: string;
    status: string;
    priority: string;
    assigneeName: string | null;
    assigneePhone: string | null;
    cost: number | null;
  };
  canViewFinance: boolean;
}) {
  const [state, action] = useActionState(updateComplaintAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="complaintId" value={complaint.id} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status" name="status" state={state} htmlFor="u-status">
          <Select id="u-status" name="status" defaultValue={complaint.status}>
            {STATUS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prioritas" name="priority" state={state} htmlFor="u-priority">
          <Select id="u-priority" name="priority" defaultValue={complaint.priority}>
            {PRIORITY.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Teknisi / petugas"
          name="assigneeName"
          state={state}
          defaultValue={complaint.assigneeName ?? ""}
          placeholder="Pak Joko"
        />
        <TextField
          label="No. HP petugas"
          name="assigneePhone"
          state={state}
          inputMode="tel"
          defaultValue={complaint.assigneePhone ? `0${complaint.assigneePhone.slice(2)}` : ""}
        />
      </div>
      {canViewFinance && (
        <MoneyField
          label="Biaya perbaikan (Rp)"
          name="cost"
          state={state}
          defaultValue={complaint.cost ? complaint.cost.toLocaleString("id-ID") : ""}
          hint="Saat status Selesai, biaya otomatis dicatat sebagai pengeluaran."
        />
      )}
      <Field
        label="Catatan untuk penghuni (opsional)"
        name="note"
        state={state}
        htmlFor="u-note"
        hint="Dikirim lewat WA bila status berubah."
      >
        <Textarea id="u-note" name="note" rows={2} placeholder="Teknisi datang besok jam 9" />
      </Field>
      <FormAlert state={state} />
      <SubmitButton>Simpan</SubmitButton>
    </form>
  );
}

export function StaffCommentForm({ complaintId, disabled }: { complaintId: string; disabled: boolean }) {
  const [state, action] = useActionState(staffCommentAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="complaintId" value={complaintId} />
      <Textarea
        name="body"
        rows={2}
        required
        placeholder="Balas ke penghuni (terkirim via WA)…"
        aria-label="Balasan"
        disabled={disabled}
      />
      <FormAlert state={state} />
      <SubmitButton size="sm" disabled={disabled}>
        Kirim balasan
      </SubmitButton>
    </form>
  );
}

export function StaffCreateComplaintForm({
  rooms,
}: {
  rooms: { id: string; code: string; tenantName: string | null }[];
}) {
  const [state, action] = useActionState(staffCreateComplaintAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Kamar" name="roomId" state={state} htmlFor="n-room">
          <Select id="n-room" name="roomId" defaultValue="">
            <option value="">Area umum</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code}
                {r.tenantName ? ` · ${r.tenantName}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Kategori" name="category" state={state} htmlFor="n-category">
          <Select id="n-category" name="category" defaultValue="facility">
            {CATEGORY.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prioritas" name="priority" state={state} htmlFor="n-priority">
          <Select id="n-priority" name="priority" defaultValue="medium">
            {PRIORITY.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <TextField
        label="Judul"
        name="title"
        state={state}
        required
        placeholder="Lampu koridor lantai 2 mati"
      />
      <TextField
        label="Lokasi (bila area umum)"
        name="location"
        state={state}
        placeholder="Koridor lantai 2"
      />
      <Field label="Keterangan" name="description" state={state} htmlFor="n-desc">
        <Textarea id="n-desc" name="description" rows={2} />
      </Field>
      <FormAlert state={state} />
      <SubmitButton size="sm">Catat komplain</SubmitButton>
    </form>
  );
}
