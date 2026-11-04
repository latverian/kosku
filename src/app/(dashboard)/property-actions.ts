"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { ACTIVE_PROPERTY_COOKIE, listMyProperties } from "@/server/dashboard";

/** Ganti properti aktif (hanya ke properti yang user punya akses). */
export async function switchPropertyAction(formData: FormData) {
  const user = await getCurrentUser();
  const id = String(formData.get("propertyId"));
  if (id === "__new") redirect("/mulai?baru=1");
  const list = await listMyProperties(user.id);
  if (!list.some((p) => p.id === id)) return;
  (await cookies()).set(ACTIVE_PROPERTY_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  redirect("/");
}
