import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { adminDb, schema } from "@/db";
import { devPreviewUserId, supabaseEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  name: string;
  /** true jika berjalan di mode pratinjau development tanpa Supabase */
  preview: boolean;
};

/**
 * Data Access Layer: satu-satunya cara membaca user yang login.
 * Dipanggil di setiap halaman & server action (jangan percaya proxy saja).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  // Selalu per-request: jangan pernah di-prerender saat build.
  await connection();
  const previewId = devPreviewUserId();
  if (!supabaseEnv()) {
    if (!previewId) redirect("/login");
    return { id: previewId, email: null, name: await profileName(previewId, "Pratinjau"), preview: true };
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");

  const email = typeof claims.email === "string" ? claims.email : null;
  return {
    id: claims.sub,
    email,
    name: await profileName(claims.sub, email?.split("@")[0] ?? "Pengguna"),
    preview: false,
  };
});

async function profileName(userId: string, fallback: string) {
  const [row] = await adminDb()
    .select({ fullName: schema.profiles.fullName })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, userId));
  return row?.fullName || fallback;
}
