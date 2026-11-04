"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb, asUser } from "@/db";
import { normalizePhone } from "@/lib/format";
import { REMINDER_OPTIONS } from "@/lib/messaging/schedule";
import { DEFAULT_TEMPLATES, type TemplateType } from "@/lib/messaging/templates";
import { checkbox, requiredText } from "@/lib/validation";
import { attempt, formValues, parseForm, requireContext } from "@/server/actions";
import { dispatchSoon } from "@/server/dispatch";
import type { FormState } from "@/server/form-state";
import { ServiceError } from "@/services/core";
import { createBroadcast, enqueue, resendMessage, saveTemplate, sendQueued } from "@/services/messaging";
import { getProperty, updateReminderSettings } from "@/services/properties";
import { providerFromEnv } from "@/services/whatsapp";

const refresh = () => revalidatePath("/pesan");

export async function resendAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const id = String(formData.get("messageId"));
  return attempt(async () => {
    await asUser(user.id, (tx) => resendMessage(tx, actor, id));
    dispatchSoon(property.id);
    refresh();
    return { ok: true, message: "Pesan dimasukkan ke antrian lagi." };
  });
}

const templateTypes = Object.keys(DEFAULT_TEMPLATES) as [TemplateType, ...TemplateType[]];

export async function saveTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const parsed = parseForm(
    z.object({ type: z.enum(templateTypes), body: requiredText("Isi template", 2000), enabled: checkbox }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const { type, ...input } = parsed.data;
  return attempt(async () => {
    await asUser(user.id, (tx) => saveTemplate(tx, actor, property.id, type, input));
    refresh();
    return { ok: true, message: "Template disimpan." };
  });
}

export async function resetTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const type = String(formData.get("type")) as TemplateType;
  if (!(type in DEFAULT_TEMPLATES)) return { error: "Template tidak dikenal." };
  return attempt(async () => {
    await asUser(user.id, (tx) =>
      saveTemplate(tx, actor, property.id, type, { body: DEFAULT_TEMPLATES[type], enabled: true }),
    );
    refresh();
    return { ok: true, message: "Template dikembalikan ke bawaan." };
  });
}

export async function broadcastAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const parsed = parseForm(
    z.object({
      title: requiredText("Judul", 100),
      body: requiredText("Isi pengumuman", 2000),
      audience: z.enum(["all", "floors"]),
      floors: z.string().optional(),
    }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const { title, body, audience, floors } = parsed.data;
  const floorList = (floors ?? "")
    .split(",")
    .map((f) => Number(f.trim()))
    .filter((n) => Number.isInteger(n));
  if (audience === "floors" && floorList.length === 0) {
    return {
      error: "Isi nomor lantai.",
      fieldErrors: { floors: "Contoh: 1, 2" },
      values: formValues(formData),
    };
  }
  return attempt(
    async () => {
      const { recipients } = await asUser(user.id, (tx) =>
        createBroadcast(tx, actor, property.id, {
          title,
          body,
          audience: audience === "all" ? { all: true } : { floors: floorList },
        }),
      );
      dispatchSoon(property.id);
      refresh();
      return { ok: true, message: `Pengumuman masuk antrian untuk ${recipients} penghuni.` };
    },
    { values: formValues(formData) },
  );
}

export async function reminderSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const parsed = parseForm(
    z.object({
      remindersEnabled: checkbox,
      quietStart: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM"),
      quietEnd: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM"),
    }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const offsets = REMINDER_OPTIONS.filter((o) => formData.get(`offset_${o.offset}`) === "on").map(
    (o) => o.offset,
  );
  return attempt(async () => {
    await asUser(user.id, (tx) =>
      updateReminderSettings(tx, actor, property.id, { ...parsed.data, reminderOffsets: offsets }),
    );
    refresh();
    return { ok: true, message: "Pengaturan pengingat disimpan." };
  });
}

export async function sendTestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property } = await requireContext();
  const raw = String(formData.get("phone") ?? "");
  return attempt(
    async () => {
      const detail = await asUser(user.id, (tx) => getProperty(tx, property.id));
      const phone = raw ? normalizePhone(raw) : detail.contactPhone;
      if (!phone)
        throw new ServiceError("Isi nomor WA tujuan (atau isi No. WA pengelola di Pengaturan).", "phone");
      const msg = await asUser(user.id, (tx) =>
        enqueue(tx, {
          propertyId: property.id,
          toPhone: phone,
          type: "manual",
          body: `✅ Pesan uji dari Kosku untuk ${detail.name}. Jika pesan ini sampai, WhatsApp sudah terhubung.`,
          ignoreQuietHours: true,
        }),
      );
      const result = await sendQueued(adminDb(), providerFromEnv(), {
        propertyId: property.id,
        onlyIds: [msg!.id],
        delayMs: 0,
      });
      refresh();
      return result.sent
        ? { ok: true, message: `Pesan uji terkirim ke ${phone}.` }
        : { error: "Pesan uji gagal. Lihat alasannya di log pesan di bawah." };
    },
    { values: formValues(formData) },
  );
}

export async function sendNowAction(): Promise<FormState> {
  const { property } = await requireContext();
  return attempt(async () => {
    const r = await sendQueued(adminDb(), providerFromEnv(), {
      propertyId: property.id,
      limit: 20,
      delayMs: 1000,
      deadlineMs: 40_000,
    });
    refresh();
    return {
      ok: true,
      message: `Terkirim ${r.sent}, gagal ${r.failed}, dicoba ulang nanti ${r.retried}, dilewati ${r.skipped}.`,
    };
  });
}
