"use client";

import { useActionState } from "react";
import { FormAlert, SubmitButton, TextField } from "@/components/forms";
import { addManagerAction, financeAccessAction, removeMemberAction } from "./actions";

export function AddManagerForm() {
  const [state, action] = useActionState(addManagerAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <TextField
        label="Email pengelola"
        name="email"
        type="email"
        state={state}
        placeholder="joko@email.com"
        required
        hint="Pengelola perlu daftar akun di halaman Daftar dulu."
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="canViewFinance" className="size-5 accent-[var(--primary)]" />
        Boleh melihat laporan keuangan & pengeluaran
      </label>
      <FormAlert state={state} />
      <SubmitButton size="sm">Tambahkan</SubmitButton>
    </form>
  );
}

export function MemberActions({ userId, canViewFinance }: { userId: string; canViewFinance: boolean }) {
  const [financeState, finance] = useActionState(financeAccessAction, undefined);
  const [removeState, remove] = useActionState(removeMemberAction, undefined);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={finance}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="allow" value={String(!canViewFinance)} />
        <SubmitButton size="sm" variant="outline" pendingText="…">
          {canViewFinance ? "Cabut izin keuangan" : "Beri izin keuangan"}
        </SubmitButton>
      </form>
      <form
        action={remove}
        onSubmit={(e) => {
          if (!confirm("Hapus pengelola ini dari tim?")) e.preventDefault();
        }}
      >
        <input type="hidden" name="userId" value={userId} />
        <SubmitButton size="sm" variant="ghost" className="text-status-overdue" pendingText="…">
          Hapus
        </SubmitButton>
      </form>
      <div className="basis-full">
        <FormAlert state={financeState ?? removeState} />
      </div>
    </div>
  );
}
