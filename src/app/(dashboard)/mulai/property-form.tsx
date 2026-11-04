"use client";

import { useActionState } from "react";
import { FormAlert, SubmitButton, TextField } from "@/components/forms";
import { createPropertyAction } from "../pengaturan/actions";

export function CreatePropertyForm() {
  const [state, action] = useActionState(createPropertyAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <TextField label="Nama kos" name="name" state={state} placeholder="Kos Melati" required />
      <TextField
        label="Kode singkat"
        name="code"
        state={state}
        placeholder="MLT"
        maxLength={5}
        className="max-w-40"
        hint="2–5 huruf/angka. Dipakai di nomor tagihan, contoh KSK-MLT-202611-12. Tidak bisa diubah."
        required
      />
      <TextField label="Alamat" name="address" state={state} placeholder="Jl. Melati No. 12, Bandung" />
      <TextField
        label="No. WA pengelola"
        name="contactPhone"
        state={state}
        inputMode="tel"
        placeholder="0812 3456 7890"
        hint="Ditampilkan ke penghuni."
      />
      <FormAlert state={state} />
      <SubmitButton className="w-full sm:w-auto" pendingText="Membuat…">
        Buat kos
      </SubmitButton>
    </form>
  );
}
