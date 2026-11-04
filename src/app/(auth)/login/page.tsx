import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseEnv } from "@/lib/supabase/config";
import { NotConfiguredNotice } from "../form-message";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const nextPath = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Masuk</CardTitle>
        <CardDescription>Kelola kos kamu dari HP atau laptop.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error === "link" && (
          <p role="alert" className="rounded-lg bg-status-overdue-bg p-3 text-sm text-status-overdue">
            Link masuk tidak valid atau sudah kedaluwarsa. Minta link baru.
          </p>
        )}
        {!supabaseEnv() && <NotConfiguredNotice />}
        <LoginForm next={nextPath} />
      </CardContent>
    </Card>
  );
}
