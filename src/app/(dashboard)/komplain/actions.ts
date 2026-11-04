"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { asUser } from "@/db";
import { leases } from "@/db/schema";
import { optionalPhone, optionalText, parseRupiah, requiredText } from "@/lib/validation";
import { attempt, formValues, parseForm, requireContext } from "@/server/actions";
import { dispatchSoon } from "@/server/dispatch";
import type { FormState } from "@/server/form-state";
import { addComplaintComment, createComplaint, updateComplaint } from "@/services/complaints";

const statusEnum = z.enum(["open", "in_progress", "resolved", "rejected"]);
const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);

const updateSchema = z.object({
  complaintId: z.uuid(),
  status: statusEnum,
  priority: priorityEnum,
  assigneeName: optionalText,
  assigneePhone: optionalPhone,
  cost: z
    .string()
    .optional()
    .transform((v) => (v ? parseRupiah(v) : null)),
  note: optionalText,
});

export async function updateComplaintAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const parsed = parseForm(updateSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { complaintId, ...input } = parsed.data;
  return attempt(
    async () => {
      await asUser(user.id, (tx) => updateComplaint(tx, actor, complaintId, input));
      dispatchSoon(property.id);
      revalidatePath("/", "layout");
      return { ok: true, message: "Komplain diperbarui." };
    },
    { values: formValues(formData) },
  );
}

export async function staffCommentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const complaintId = String(formData.get("complaintId"));
  const body = String(formData.get("body") ?? "");
  return attempt(async () => {
    await asUser(user.id, (tx) => addComplaintComment(tx, { kind: "staff", actor }, complaintId, body));
    dispatchSoon(property.id);
    revalidatePath(`/komplain/${complaintId}`);
    return { ok: true, message: "Balasan terkirim ke penghuni." };
  });
}

const createSchema = z.object({
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
  priority: priorityEnum,
  roomId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()).transform((v) => v ?? null),
  location: optionalText,
});

export async function staffCreateComplaintAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const parsed = parseForm(createSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;
  let id = "";
  const result = await attempt(
    async () => {
      const c = await asUser(user.id, async (tx) => {
        // Penghuni aktif kamar itu (bila ada) jadi pelapor agar dapat kabar via WA
        const [lease] = data.roomId
          ? await tx
              .select({ tenantId: leases.tenantId })
              .from(leases)
              .where(and(eq(leases.roomId, data.roomId), eq(leases.status, "active")))
          : [];
        return createComplaint(
          tx,
          { kind: "staff", actor },
          { propertyId: property.id, ...data, tenantId: lease?.tenantId ?? null },
        );
      });
      id = c.id;
      dispatchSoon(property.id);
    },
    { values: formValues(formData) },
  );
  if (result?.error) return result;
  revalidatePath("/", "layout");
  redirect(`/komplain/${id}`);
}
