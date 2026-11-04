"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asUser } from "@/db";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/finance";
import { isoDate, money, optionalText } from "@/lib/validation";
import { attempt, formValues, parseForm, requireContext } from "@/server/actions";
import type { FormState } from "@/server/form-state";
import { filesOf, saveUpload } from "@/server/uploads";
import { createExpense, deleteExpense } from "@/services/finance";

const categories = Object.keys(EXPENSE_CATEGORIES) as [ExpenseCategory, ...ExpenseCategory[]];
const schema = z.object({
  category: z.enum(categories),
  amount: money("Nominal"),
  spentOn: isoDate("Tanggal"),
  description: optionalText,
});

export async function createExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const parsed = parseForm(schema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;
  return attempt(
    async () => {
      const [file] = filesOf(formData, "receipt");
      const receipt = file ? await saveUpload("receipts", property.id, file, "receipt") : null;
      await asUser(user.id, (tx) =>
        createExpense(tx, actor, property.id, { ...data, receiptPath: receipt?.path ?? null }),
      );
      revalidatePath("/keuangan");
      return { ok: true, message: "Pengeluaran dicatat." };
    },
    { values: formValues(formData) },
  );
}

export async function deleteExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, actor } = await requireContext();
  const id = String(formData.get("expenseId"));
  return attempt(async () => {
    await asUser(user.id, (tx) => deleteExpense(tx, actor, id));
    revalidatePath("/keuangan");
    return { ok: true, message: "Pengeluaran dihapus." };
  });
}
