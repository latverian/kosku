"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asUser } from "@/db";
import { todayIn } from "@/lib/billing";
import {
  checkbox,
  intInRange,
  isoDate,
  money,
  optionalEmail,
  optionalIsoDate,
  optionalMoney,
  optionalPhone,
  optionalText,
  phone,
  requiredText,
} from "@/lib/validation";
import { attempt, formValues, parseForm, requireContext } from "@/server/actions";
import type { FormState } from "@/server/form-state";
import { checkIn, checkOut, moveRoom, updateTenant } from "@/services/tenants";

const nik = z
  .preprocess((v) => (typeof v === "string" ? v.replace(/\D/g, "") : v), z.string())
  .refine((v) => v === "" || v.length === 16, "NIK harus 16 digit")
  .transform((v) => v || null);

const tenantSchema = z.object({
  fullName: requiredText("Nama lengkap", 100),
  phone: phone("No. WhatsApp"),
  email: optionalEmail,
  nik,
  occupation: optionalText,
  emergencyName: optionalText,
  emergencyRelation: optionalText,
  emergencyPhone: optionalPhone,
  notes: optionalText,
});

const monthToPeriod = z
  .preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}$/, "Bulan tidak valid")
      .optional(),
  )
  .transform((v) => (v ? `${v}-01` : null));

const checkInSchema = tenantSchema.extend({
  roomId: z.uuid("Pilih kamar"),
  startDate: isoDate("Tanggal masuk"),
  endDate: optionalIsoDate,
  monthlyRent: money("Harga sewa"),
  billingDay: intInRange("Tanggal tagih", 1, 28),
  depositAmount: optionalMoney,
  existingTenant: checkbox,
  billingStartMonth: monthToPeriod,
});

const nikKey = () => process.env.NIK_ENCRYPTION_KEY || null;

export async function checkInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const parsed = parseForm(checkInSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;
  const {
    roomId,
    startDate,
    endDate,
    monthlyRent,
    billingDay,
    depositAmount,
    existingTenant,
    billingStartMonth,
    ...tenant
  } = data;
  if (existingTenant && !billingStartMonth) {
    return {
      error: "Pilih bulan mulai ditagih.",
      fieldErrors: { billingStartMonth: "Wajib untuk penghuni lama" },
      values: formValues(formData),
    };
  }

  let tenantId = "";
  const result = await attempt(
    async () => {
      const r = await asUser(user.id, (tx) =>
        checkIn(tx, actor, {
          roomId,
          tenant,
          lease: {
            startDate,
            endDate,
            monthlyRent,
            billingDay,
            depositAmount,
            billingStartPeriod: existingTenant ? billingStartMonth : null,
          },
          nikKey: nikKey(),
          today: todayIn(property.timezone),
        }),
      );
      tenantId = r.tenant.id;
    },
    { values: formValues(formData) },
  );
  if (result?.error) return result;
  revalidatePath("/", "layout");
  redirect(`/penghuni/${tenantId}?baru=1`);
}

export async function updateTenantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, actor } = await requireContext();
  const tenantId = String(formData.get("tenantId"));
  const parsed = parseForm(tenantSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;
  return attempt(
    async () => {
      await asUser(user.id, (tx) => updateTenant(tx, actor, tenantId, data, nikKey()));
      revalidatePath(`/penghuni/${tenantId}`);
      return { ok: true, message: "Data penghuni disimpan." };
    },
    { values: formValues(formData) },
  );
}

const checkOutSchema = z.object({
  leaseId: z.uuid(),
  endDate: isoDate("Tanggal keluar"),
  reason: optionalText,
  depositStatus: z.enum(["refunded", "partial_refund", "forfeited", "held"]),
  depositRefunded: optionalMoney,
});

export async function checkOutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, actor } = await requireContext();
  const parsed = parseForm(checkOutSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;
  const tenantId = String(formData.get("tenantId"));
  let voidedCount = 0;
  const result = await attempt(
    async () => {
      const { voided } = await asUser(user.id, (tx) => checkOut(tx, actor, data));
      voidedCount = voided.length;
    },
    { values: formValues(formData) },
  );
  if (result?.error) return result;
  revalidatePath("/", "layout");
  redirect(`/penghuni/${tenantId}?checkout=${voidedCount}`);
}

const moveSchema = z.object({
  leaseId: z.uuid(),
  newRoomId: z.uuid("Pilih kamar tujuan"),
  moveDate: isoDate("Tanggal pindah"),
  monthlyRent: money("Harga sewa baru"),
});

export async function moveRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const parsed = parseForm(moveSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;
  const tenantId = String(formData.get("tenantId"));
  const result = await attempt(
    async () => {
      await asUser(user.id, (tx) => moveRoom(tx, actor, { ...data, today: todayIn(property.timezone) }));
    },
    { values: formValues(formData) },
  );
  if (result?.error) return result;
  revalidatePath("/", "layout");
  redirect(`/penghuni/${tenantId}?pindah=1`);
}
