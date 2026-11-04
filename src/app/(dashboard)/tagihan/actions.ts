"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asUser } from "@/db";
import { todayIn } from "@/lib/billing";
import { isoDate, money, optionalText, requiredText } from "@/lib/validation";
import { attempt, formValues, parseForm, requireContext } from "@/server/actions";
import type { FormState } from "@/server/form-state";
import {
  addInvoiceItem,
  generateInvoicesForProperty,
  recordPayment,
  rejectPayment,
  removeInvoiceItem,
  verifyPayment,
  voidInvoice,
} from "@/services/billing";
import { dispatchSoon } from "@/server/dispatch";
import { remindNow } from "@/services/messaging";

const refresh = () => revalidatePath("/", "layout");

export async function generateNowAction(): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  return attempt(async () => {
    const count = await asUser(user.id, (tx) =>
      generateInvoicesForProperty(tx, actor, property.id, todayIn(property.timezone)),
    );
    refresh();
    return {
      ok: true,
      message: count
        ? `${count} tagihan baru dibuat.`
        : "Semua tagihan sudah lengkap. Tidak ada tagihan baru.",
    };
  });
}

const itemSchema = z.object({
  invoiceId: z.uuid(),
  type: z.enum(["electricity", "water", "laundry", "late_fee", "discount", "other"]),
  description: requiredText("Keterangan", 120),
  amount: money("Nominal"),
});

export async function addItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, actor } = await requireContext();
  const parsed = parseForm(itemSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { invoiceId, ...item } = parsed.data;
  return attempt(
    async () => {
      await asUser(user.id, (tx) => addInvoiceItem(tx, actor, invoiceId, item));
      refresh();
      return { ok: true, message: "Item ditambahkan." };
    },
    { values: formValues(formData) },
  );
}

export async function removeItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, actor } = await requireContext();
  const itemId = String(formData.get("itemId"));
  return attempt(async () => {
    await asUser(user.id, (tx) => removeInvoiceItem(tx, actor, itemId));
    refresh();
    return { ok: true, message: "Item dihapus." };
  });
}

export async function voidInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, actor } = await requireContext();
  const invoiceId = String(formData.get("invoiceId"));
  const reason = String(formData.get("reason") ?? "");
  return attempt(
    async () => {
      await asUser(user.id, (tx) => voidInvoice(tx, actor, invoiceId, reason));
      refresh();
      return { ok: true, message: "Tagihan dibatalkan." };
    },
    { values: formValues(formData) },
  );
}

const paymentSchema = z.object({
  invoiceId: z.uuid("Pilih tagihan"),
  amount: money("Nominal"),
  method: z.enum(["cash", "transfer", "qris", "va", "ewallet", "other"]),
  paidAt: isoDate("Tanggal bayar"),
  notes: optionalText,
});

export async function recordPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const parsed = parseForm(paymentSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { paidAt, ...rest } = parsed.data;
  const result = await attempt(
    async () => {
      // tengah hari WIB agar tanggal tidak bergeser karena zona waktu
      await asUser(user.id, (tx) =>
        recordPayment(tx, actor, { ...rest, paidAt: new Date(`${paidAt}T05:00:00Z`) }),
      );
      dispatchSoon(property.id);
      refresh();
      return { ok: true, message: "Pembayaran dicatat." };
    },
    { values: formValues(formData) },
  );
  if (result?.error) return result;
  redirect(`/tagihan/${rest.invoiceId}?dibayar=1`);
}

export async function verifyPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const paymentId = String(formData.get("paymentId"));
  return attempt(async () => {
    await asUser(user.id, (tx) => verifyPayment(tx, actor, paymentId));
    dispatchSoon(property.id);
    refresh();
    return { ok: true, message: "Pembayaran diverifikasi." };
  });
}

export async function rejectPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const paymentId = String(formData.get("paymentId"));
  const reason = String(formData.get("reason") ?? "");
  return attempt(async () => {
    await asUser(user.id, (tx) => rejectPayment(tx, actor, paymentId, reason));
    dispatchSoon(property.id);
    refresh();
    return { ok: true, message: "Pembayaran ditolak." };
  });
}

export async function remindNowAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const invoiceId = String(formData.get("invoiceId"));
  return attempt(async () => {
    const msg = await asUser(user.id, (tx) => remindNow(tx, actor, invoiceId));
    dispatchSoon(property.id);
    revalidatePath(`/tagihan/${invoiceId}`);
    const later = msg && msg.scheduledAt.getTime() > Date.now() + 60_000;
    return {
      ok: true,
      message: later
        ? `Pengingat dijadwalkan ${msg!.scheduledAt.toLocaleTimeString("id-ID", { timeZone: property.timezone, hour: "2-digit", minute: "2-digit" })} (sekarang jam tenang).`
        : "Pengingat WA dikirim.",
    };
  });
}
