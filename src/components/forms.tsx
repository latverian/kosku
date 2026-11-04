"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/server/form-state";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  pendingText = "Menyimpan…",
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}

/** Label + input + pesan error/hint. Error diambil dari state.fieldErrors[name]. */
export function Field({
  label,
  name,
  state,
  hint,
  className,
  htmlFor,
  children,
}: {
  label: string;
  name: string;
  state?: FormState;
  hint?: ReactNode;
  className?: string;
  /** id input; default = name (pastikan unik di halaman) */
  htmlFor?: string;
  children?: ReactNode;
}) {
  const error = state?.fieldErrors?.[name];
  const id = htmlFor ?? name;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-status-overdue">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  name,
  state,
  hint,
  className,
  ...props
}: ComponentProps<typeof Input> & { label: string; name: string; state?: FormState; hint?: ReactNode }) {
  const error = state?.fieldErrors?.[name];
  // ID unik: satu halaman bisa memuat beberapa form dengan nama field yang sama
  const autoId = useId();
  const id = props.id ?? `${name}${autoId}`;
  return (
    <Field label={label} name={name} state={state} hint={hint} className={className} htmlFor={id}>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        defaultValue={state?.values?.[name] ?? props.defaultValue}
        key={state?.values?.[name] !== undefined ? `${name}-${state.values[name]}` : undefined}
        {...props}
      />
    </Field>
  );
}

/** Input Rupiah: tampil "1.500.000", dikirim apa adanya lalu diparse server. */
export function MoneyField(props: ComponentProps<typeof TextField>) {
  return <TextField inputMode="numeric" autoComplete="off" placeholder="0" {...props} />;
}

export function FormAlert({ state }: { state: FormState }) {
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
  if (state?.ok && state.message) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-lg bg-status-paid-bg p-3 text-sm text-status-paid"
      >
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }
  return null;
}
