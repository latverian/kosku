import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseEnv } from "@/lib/supabase/config";
import { NotConfiguredNotice } from "../form-message";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Daftar" };

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Daftar akun pemilik</CardTitle>
        <CardDescription>Gratis. Setelah daftar, kamu bisa menambahkan kos pertama.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!supabaseEnv() && <NotConfiguredNotice />}
        <SignupForm />
      </CardContent>
    </Card>
  );
}
