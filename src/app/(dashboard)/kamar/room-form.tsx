"use client";

import { useActionState, useState } from "react";
import { Field, FormAlert, MoneyField, SubmitButton, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ROOM_STATUS_LABEL } from "@/lib/labels";
import type { FormState } from "@/server/form-state";
import { archiveRoomAction, createRoomsAction, updateRoomAction } from "./actions";

type RoomValues = {
  id?: string;
  code: string;
  floor: number | null;
  type: string | null;
  capacity: number;
  monthlyPrice: number;
  depositAmount: number;
  facilities: string[];
  notes: string | null;
  status?: keyof typeof ROOM_STATUS_LABEL;
};

const fmt = (n: number) => (n ? n.toLocaleString("id-ID") : "");

function SharedFields({ state, room }: { state: FormState; room?: RoomValues }) {
  const v = state?.values;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Lantai"
          name="floor"
          state={state}
          type="number"
          defaultValue={v?.floor ?? room?.floor ?? ""}
        />
        <TextField
          label="Tipe"
          name="type"
          state={state}
          placeholder="Standar / AC / KM dalam"
          defaultValue={v?.type ?? room?.type ?? ""}
        />
        <TextField
          label="Kapasitas (orang)"
          name="capacity"
          state={state}
          type="number"
          min={1}
          max={10}
          defaultValue={v?.capacity ?? room?.capacity ?? 1}
          hint="Lebih dari 1 untuk kamar sharing"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          label="Harga per bulan (Rp)"
          name="monthlyPrice"
          state={state}
          defaultValue={v?.monthlyPrice ?? fmt(room?.monthlyPrice ?? 0)}
          required
        />
        <MoneyField
          label="Deposit (Rp)"
          name="depositAmount"
          state={state}
          defaultValue={v?.depositAmount ?? fmt(room?.depositAmount ?? 0)}
        />
      </div>
      <TextField
        label="Fasilitas"
        name="facilities"
        state={state}
        placeholder="AC, WiFi, KM dalam, Lemari"
        defaultValue={v?.facilities ?? room?.facilities.join(", ") ?? ""}
        hint="Pisahkan dengan koma"
      />
      <Field label="Catatan" name="notes" state={state}>
        <Textarea id="notes" name="notes" rows={2} defaultValue={v?.notes ?? room?.notes ?? ""} />
      </Field>
    </>
  );
}

export function CreateRoomsForm() {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [state, action] = useActionState(createRoomsAction, undefined);
  const v = state?.values;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />
      <div
        role="tablist"
        aria-label="Cara menambah"
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:max-w-sm"
      >
        {(
          [
            ["single", "Satu kamar"],
            ["bulk", "Banyak sekaligus"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "h-9 rounded-md text-sm font-medium",
              mode === value ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "single" ? (
        <TextField
          label="Kode / nomor kamar"
          name="code"
          state={state}
          placeholder="01"
          className="max-w-40"
          required
        />
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <TextField
              label="Awalan"
              name="prefix"
              state={state}
              placeholder="A-"
              defaultValue={v?.prefix ?? ""}
            />
            <TextField
              label="Nomor awal"
              name="start"
              state={state}
              type="number"
              min={0}
              defaultValue={v?.start ?? 1}
            />
            <TextField
              label="Jumlah kamar"
              name="count"
              state={state}
              type="number"
              min={1}
              max={100}
              defaultValue={v?.count ?? 4}
            />
            <TextField
              label="Digit"
              name="width"
              state={state}
              type="number"
              min={1}
              max={4}
              defaultValue={v?.width ?? 2}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Contoh: awalan kosong, mulai 1, jumlah 4, digit 2 → kamar 01, 02, 03, 04.
          </p>
        </div>
      )}

      <SharedFields state={state} />
      <FormAlert state={state} />
      <SubmitButton>{mode === "single" ? "Tambah kamar" : "Tambah semua kamar"}</SubmitButton>
    </form>
  );
}

export function EditRoomForm({ room }: { room: RoomValues & { id: string } }) {
  const [state, action] = useActionState(updateRoomAction, undefined);
  const occupied = room.status === "occupied";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="roomId" value={room.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Kode / nomor kamar" name="code" state={state} defaultValue={room.code} required />
        <Field
          label="Status"
          name="status"
          state={state}
          hint={occupied ? "Status terisi diatur otomatis dari check-in/check-out." : undefined}
        >
          <Select id="status" name="status" defaultValue={room.status} disabled={occupied}>
            {occupied && <option value="occupied">{ROOM_STATUS_LABEL.occupied}</option>}
            <option value="vacant">{ROOM_STATUS_LABEL.vacant}</option>
            <option value="reserved">{ROOM_STATUS_LABEL.reserved}</option>
            <option value="maintenance">{ROOM_STATUS_LABEL.maintenance}</option>
          </Select>
        </Field>
      </div>
      <SharedFields state={state} room={room} />
      <FormAlert state={state} />
      <SubmitButton>Simpan perubahan</SubmitButton>
    </form>
  );
}

export function ArchiveRoomButton({ roomId, disabled }: { roomId: string; disabled: boolean }) {
  const [state, action] = useActionState(archiveRoomAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Arsipkan kamar ini? Kamar tidak akan tampil lagi di daftar.")) e.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="roomId" value={roomId} />
      <Button type="submit" variant="outline" className="text-status-overdue" disabled={disabled}>
        Arsipkan kamar
      </Button>
      {disabled && (
        <p className="text-xs text-muted-foreground">Check-out penghuni dulu sebelum mengarsipkan.</p>
      )}
      <FormAlert state={state} />
    </form>
  );
}
