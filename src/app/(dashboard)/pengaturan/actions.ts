"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_PROPERTY_COOKIE } from "@/server/dashboard";
import { z } from "zod";
import { asUser } from "@/db";
import {
  checkbox,
  intInRange,
  optionalMoney,
  optionalPhone,
  optionalText,
  requiredText,
} from "@/lib/validation";
import { attempt, formValues, parseForm, requireContext } from "@/server/actions";
import { getCurrentUser } from "@/server/auth";
import type { FormState } from "@/server/form-state";
import { createProperty, updateProperty, updateSettings } from "@/services/properties";

const propertySchema = z.object({
  name: requiredText("Nama kos", 100),
  address: optionalText,
  contactPhone: optionalPhone,
  rules: optionalText,
});

export async function createPropertyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const parsed = parseForm(
    propertySchema.extend({
      code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9]{2,5}$/, "Kode 2–5 huruf/angka, misalnya MLT"),
    }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;
  const result = await attempt(
    async () => {
      const created = await asUser(user.id, (tx) => createProperty(tx, { type: "user", id: user.id }, data));
      // Kos baru langsung jadi kos aktif
      (await cookies()).set(ACTIVE_PROPERTY_COOKIE, created.id, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    },
    {
      values: formValues(formData),
      uniqueMessages: { properties_code_unique: "Kode ini sudah dipakai kos lain. Coba kode lain." },
    },
  );
  if (result?.error) return result;
  revalidatePath("/", "layout");
  redirect("/pengaturan?baru=1");
}

export async function updatePropertyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const parsed = parseForm(propertySchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;
  return attempt(async () => {
    await asUser(user.id, (tx) => updateProperty(tx, actor, property.id, data));
    revalidatePath("/", "layout");
    return { ok: true, message: "Data kos disimpan." };
  });
}

const settingsSchema = z.object({
  invoiceLeadDays: intInRange("Hari sebelum jatuh tempo", 0, 28),
  prorateFirstMonth: checkbox,
  lateFeeType: z.enum(["none", "fixed", "daily"]),
  lateFeeAmount: optionalMoney,
  lateFeeMax: optionalMoney,
  lateFeeGraceDays: intInRange("Masa tenggang", 0, 30),
});

export async function updateSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const parsed = parseForm(settingsSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;

  // Rekening: bank_0, number_0, holder_0, ... (maks 3)
  const bankAccounts = [0, 1, 2]
    .map((i) => ({
      bank: String(formData.get(`bank_${i}`) ?? "").trim(),
      number: String(formData.get(`number_${i}`) ?? "").replace(/\s/g, ""),
      holder: String(formData.get(`holder_${i}`) ?? "").trim(),
    }))
    .filter((a) => a.bank || a.number || a.holder);
  const incomplete = bankAccounts.findIndex((a) => !a.bank || !a.number || !a.holder);
  if (incomplete >= 0) {
    return {
      error: `Rekening ${incomplete + 1} belum lengkap (bank, nomor, dan nama pemilik).`,
      values: formValues(formData),
    };
  }
  if (data.lateFeeType !== "none" && data.lateFeeAmount <= 0) {
    return {
      error: "Isi nominal denda.",
      fieldErrors: { lateFeeAmount: "Nominal denda wajib diisi" },
      values: formValues(formData),
    };
  }

  return attempt(async () => {
    await asUser(user.id, (tx) =>
      updateSettings(tx, actor, property.id, {
        ...data,
        lateFeeMax: data.lateFeeMax > 0 ? data.lateFeeMax : null,
        bankAccounts,
      }),
    );
    revalidatePath("/pengaturan");
    return { ok: true, message: "Pengaturan disimpan." };
  });
}
