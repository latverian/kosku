"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";
import { Field, FormAlert, MoneyField, SubmitButton, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EXPENSE_CATEGORIES } from "@/lib/finance";
import { createExpenseAction, deleteExpenseAction } from "./actions";

export function ExpenseForm({ today }: { today: string }) {
  const [state, action] = useActionState(createExpenseAction, undefined);
  return (
    <form action={action} className="space-y-3" key={state?.ok ? state.message : "form"}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Kategori" name="category" state={state} htmlFor="e-category">
          <Select id="e-category" name="category" defaultValue={state?.values?.category ?? "electricity"}>
            {Object.entries(EXPENSE_CATEGORIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <MoneyField label="Nominal (Rp)" name="amount" state={state} required />
        <TextField label="Tanggal" name="spentOn" state={state} type="date" defaultValue={today} required />
      </div>
      <TextField label="Keterangan" name="description" state={state} placeholder="Token listrik November" />
      <Field label="Foto nota (opsional)" name="receipt" state={state} htmlFor="e-receipt">
        <Input
          id="e-receipt"
          name="receipt"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
        />
      </Field>
      <FormAlert state={state} />
      <SubmitButton size="sm">Catat pengeluaran</SubmitButton>
    </form>
  );
}

export function DeleteExpenseButton({ expenseId }: { expenseId: string }) {
  const [state, action] = useActionState(deleteExpenseAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Hapus pengeluaran ini?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="expenseId" value={expenseId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="size-9 text-muted-foreground"
        aria-label="Hapus pengeluaran"
        title={state?.error}
      >
        <Trash2 aria-hidden />
      </Button>
    </form>
  );
}
