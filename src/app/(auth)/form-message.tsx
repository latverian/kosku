import { CircleAlert, MailCheck } from "lucide-react";
import type { AuthState } from "./actions";

export function FormMessage({ state }: { state: AuthState }) {
  if (state?.error) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-lg bg-status-overdue-bg p-3 text-sm text-status-overdue"
      >
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {state.error}
      </p>
    );
  }
  if (state?.message) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-lg bg-status-paid-bg p-3 text-sm text-status-paid"
      >
        <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }
  return null;
}

export function NotConfiguredNotice() {
  return (
    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
      Supabase belum dikonfigurasi, jadi login belum bisa dipakai. Ikuti langkah <strong>Setup</strong> di
      README, atau aktifkan mode pratinjau development dengan{" "}
      <code className="text-xs">KOSKU_DEV_PREVIEW_USER_ID</code>.
    </p>
  );
}
