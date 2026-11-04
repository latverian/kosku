import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { toServiceError } from "@/services/core";
import { getCurrentUser, type CurrentUser } from "./auth";
import { getActiveProperty, type ActiveProperty } from "./dashboard";
import type { FormState } from "./form-state";

export type Ctx = { user: CurrentUser; property: ActiveProperty; actor: { type: "user"; id: string } };

/** User yang login + properti aktifnya. Tanpa properti → ke halaman /mulai. */
export async function requireContext(): Promise<Ctx> {
  const user = await getCurrentUser();
  const property = await getActiveProperty(user.id);
  if (!property) redirect("/mulai");
  return { user, property, actor: { type: "user", id: user.id } };
}

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { ok: true; data: z.output<T> } | { ok: false; state: FormState } {
  const values = formValues(formData);
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, state: { error: "Periksa kembali isian yang ditandai.", fieldErrors, values } };
}

/**
 * Jalankan aksi dan ubah error yang dikenal menjadi pesan form. Redirect dari
 * dalam `fn` diteruskan apa adanya.
 */
export async function attempt(
  fn: () => Promise<FormState | void>,
  opts: { values?: Record<string, string>; uniqueMessages?: Record<string, string> } = {},
): Promise<FormState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (error) {
    unstable_rethrow(error); // redirect/notFound dari Next.js diteruskan
    const friendly = toServiceError(error, opts.uniqueMessages);
    if (!friendly) {
      console.error(error);
      return { error: "Terjadi kesalahan. Coba lagi.", values: opts.values };
    }
    return {
      error: friendly.message,
      fieldErrors: friendly.field ? { [friendly.field]: friendly.message } : undefined,
      values: opts.values,
    };
  }
}
