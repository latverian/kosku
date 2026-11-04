"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { sendMagicLink, signInWithPassword } from "../actions";
import { FormMessage } from "../form-message";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [passwordState, passwordAction, passwordPending] = useActionState(signInWithPassword, undefined);
  const [magicState, magicAction, magicPending] = useActionState(sendMagicLink, undefined);

  const state = mode === "password" ? passwordState : magicState;
  const pending = mode === "password" ? passwordPending : magicPending;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Cara masuk" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(
          [
            ["password", "Email & password"],
            ["magic", "Link via email"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "h-9 rounded-md text-sm font-medium transition-colors",
              mode === value ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form action={mode === "password" ? passwordAction : magicAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state?.email}
            key={state?.email}
          />
        </div>

        {mode === "password" && (
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
        )}

        <FormMessage state={state} />

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Memproses…" : mode === "password" ? "Masuk" : "Kirim link masuk"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Belum punya akun?{" "}
        <Link href="/daftar" className="font-medium text-primary hover:underline">
          Daftar
        </Link>
      </p>
    </div>
  );
}
