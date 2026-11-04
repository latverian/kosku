"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminDb } from "@/db";
import { isoDate, money, optionalText, requiredText } from "@/lib/validation";
import { attempt, formValues, parseForm } from "@/server/actions";
import { dispatchSoon } from "@/server/dispatch";
import type { FormState } from "@/server/form-state";
import { getPortal } from "@/server/portal";
import { filesOf, saveUpload } from "@/server/uploads";
import { addComplaintComment, createComplaint, rateComplaint } from "@/services/complaints";
import { ServiceError } from "@/services/core";
import { gatewayFromEnv } from "@/services/gateway";
import { startOnlinePayment } from "@/services/online-payment";
import { submitPaymentProof } from "@/services/portal";

async function session(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const portal = await getPortal(token);
  if (!portal) throw new ServiceError("Link portal tidak berlaku. Minta link baru ke pengelola.");
  return { token, portal };
}

const proofSchema = z.object({
  invoiceId: z.uuid(),
  amount: money("Nominal"),
  paidAt: isoDate("Tanggal transfer"),
  notes: optionalText,
});

export async function uploadProofAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(proofSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;
  let token = "";
  const result = await attempt(
    async () => {
      const s = await session(formData);
      token = s.token;
      const [file] = filesOf(formData, "proof");
      if (!file) throw new ServiceError("Pilih foto bukti transfer.", "proof");
      const upload = await saveUpload("payment-proofs", s.portal.propertyId, file, "proof");
      await adminDb().transaction((tx) =>
        submitPaymentProof(tx, s.portal.tenantId, { ...data, proofPath: upload.path }),
      );
      dispatchSoon(s.portal.propertyId);
    },
    { values: formValues(formData) },
  );
  if (result?.error) return result;
  revalidatePath(`/p/${token}`);
  redirect(`/p/${token}?terkirim=1`);
}

const complaintSchema = z.object({
  category: z.enum([
    "electricity",
    "water",
    "ac",
    "internet",
    "cleanliness",
    "security",
    "facility",
    "neighbor",
    "other",
  ]),
  title: requiredText("Judul", 120),
  description: optionalText,
  priority: z.enum(["low", "medium", "high", "urgent"]),
  location: optionalText,
});

export async function createComplaintAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(complaintSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;
  let token = "";
  let complaintId = "";
  const result = await attempt(
    async () => {
      const s = await session(formData);
      token = s.token;
      const files = filesOf(formData, "photos");
      if (files.length > 5) throw new ServiceError("Maksimal 5 foto.", "photos");
      const photos: Awaited<ReturnType<typeof saveUpload>>[] = [];
      for (const f of files)
        photos.push(await saveUpload("complaint-photos", s.portal.propertyId, f, "photos"));
      const c = await adminDb().transaction((tx) =>
        createComplaint(
          tx,
          { kind: "tenant", tenantId: s.portal.tenantId },
          { propertyId: s.portal.propertyId, ...data, photos },
        ),
      );
      complaintId = c.id;
      dispatchSoon(s.portal.propertyId);
    },
    { values: formValues(formData) },
  );
  if (result?.error) return result;
  redirect(`/p/${token}/komplain/${complaintId}?baru=1`);
}

export async function commentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const complaintId = String(formData.get("complaintId"));
  const body = String(formData.get("body") ?? "");
  return attempt(async () => {
    const s = await session(formData);
    await adminDb().transaction((tx) =>
      addComplaintComment(tx, { kind: "tenant", tenantId: s.portal.tenantId }, complaintId, body),
    );
    revalidatePath(`/p/${s.token}/komplain/${complaintId}`);
    return { ok: true, message: "Komentar terkirim." };
  });
}

export async function rateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const complaintId = String(formData.get("complaintId"));
  const rating = Number(formData.get("rating"));
  return attempt(async () => {
    const s = await session(formData);
    await adminDb().transaction((tx) => rateComplaint(tx, s.portal.tenantId, complaintId, rating));
    revalidatePath(`/p/${s.token}/komplain/${complaintId}`);
    return { ok: true, message: "Terima kasih atas penilaiannya!" };
  });
}

export async function payOnlineAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const invoiceId = String(formData.get("invoiceId"));
  let url = "";
  const result = await attempt(async () => {
    const s = await session(formData);
    const gateway = gatewayFromEnv();
    if (!gateway) throw new ServiceError("Pembayaran online belum tersedia. Silakan transfer manual.");
    const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
    url = await adminDb().transaction((tx) =>
      startOnlinePayment(tx, gateway, {
        tenantId: s.portal.tenantId,
        invoiceId,
        finishUrl: `${appUrl}/p/${s.token}?bayar=1`,
      }),
    );
  });
  if (result?.error) return result;
  redirect(url);
}
