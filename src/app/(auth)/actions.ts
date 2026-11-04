"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseEnv } from "@/lib/supabase/config";

export type AuthState = { error?: string; message?: string; email?: string } | undefined;

const email = z.email("Format email tidak valid").trim().toLowerCase();

/** Hanya izinkan redirect ke path internal (cegah open redirect). */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

async function siteOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function notConfigured(): AuthState {
  return { error: "Supabase belum dikonfigurasi. Lihat README bagian Setup." };
}

export async function signInWithPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!supabaseEnv()) return notConfigured();
  const parsed = z
    .object({ email, password: z.string().min(1, "Password wajib diisi") })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, email: String(formData.get("email") ?? "") };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      error:
        error.code === "email_not_confirmed"
          ? "Email belum dikonfirmasi. Cek kotak masuk email kamu."
          : "Email atau password salah.",
      email: parsed.data.email,
    };
  }
  redirect(safeNext(formData.get("next")));
}

export async function sendMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!supabaseEnv()) return notConfigured();
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const next = safeNext(formData.get("next"));
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  // Pesan sama untuk email terdaftar/tidak, agar tidak membocorkan daftar akun.
  if (error && error.status !== 400 && error.code !== "otp_disabled") {
    return { error: "Gagal mengirim link. Coba lagi beberapa saat lagi.", email: parsed.data };
  }
  return {
    message: "Jika email terdaftar, link masuk sudah dikirim. Cek kotak masuk (dan folder spam).",
    email: parsed.data,
  };
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!supabaseEnv()) return notConfigured();
  const parsed = z
    .object({
      fullName: z.string().trim().min(2, "Nama minimal 2 huruf").max(100),
      email,
      password: z.string().min(8, "Password minimal 8 karakter"),
    })
    .safeParse({
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, email: String(formData.get("email") ?? "") };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/`,
    },
  });
  if (error) {
    return {
      error: error.code === "weak_password" ? "Password terlalu lemah." : "Pendaftaran gagal. Coba lagi.",
      email: parsed.data.email,
    };
  }
  if (data.session) redirect("/");
  return { message: "Akun dibuat. Cek email kamu untuk konfirmasi, lalu masuk.", email: parsed.data.email };
}

export async function signOut() {
  if (supabaseEnv()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
