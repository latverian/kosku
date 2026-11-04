export type SupabaseEnv = { url: string; anonKey: string };

/** null jika Supabase belum dikonfigurasi (mis. development awal). */
export function supabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Boleh diisi anon key lama atau publishable key baru (sb_publishable_...).
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/**
 * Mode pratinjau development: tanpa Supabase, aplikasi berjalan sebagai user
 * tertentu (RLS tetap berlaku). TIDAK PERNAH aktif di production.
 */
export function devPreviewUserId(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  return process.env.KOSKU_DEV_PREVIEW_USER_ID || null;
}
