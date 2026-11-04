"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb, asUser } from "@/db";
import { checkbox } from "@/lib/validation";
import { attempt, formValues, parseForm, requireContext } from "@/server/actions";
import type { FormState } from "@/server/form-state";
import { addManager, findUserIdByEmail, removeMember, setFinanceAccess } from "@/services/team";

export async function addManagerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const parsed = parseForm(
    z.object({ email: z.email("Format email tidak valid"), canViewFinance: checkbox }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const { email, canViewFinance } = parsed.data;
  return attempt(
    async () => {
      const userId = await adminDb().transaction((tx) => findUserIdByEmail(tx, email));
      await asUser(user.id, (tx) => addManager(tx, actor, property.id, userId, canViewFinance));
      revalidatePath("/pengaturan/tim");
      return { ok: true, message: `${email} ditambahkan sebagai pengelola.` };
    },
    { values: formValues(formData) },
  );
}

export async function financeAccessAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const userId = String(formData.get("userId"));
  const allow = formData.get("allow") === "true";
  return attempt(async () => {
    await asUser(user.id, (tx) => setFinanceAccess(tx, actor, property.id, userId, allow));
    revalidatePath("/pengaturan/tim");
    return { ok: true, message: allow ? "Izin keuangan diberikan." : "Izin keuangan dicabut." };
  });
}

export async function removeMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const userId = String(formData.get("userId"));
  return attempt(async () => {
    await asUser(user.id, (tx) => removeMember(tx, actor, property.id, userId));
    revalidatePath("/pengaturan/tim");
    return { ok: true, message: "Pengelola dihapus dari tim." };
  });
}
