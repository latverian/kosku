"use client";

import { useActionState, useState } from "react";
import { Field, FormAlert, SubmitButton, TextField } from "@/components/forms";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { REMINDER_OPTIONS } from "@/lib/messaging/schedule";
import { missingVariables, renderTemplate } from "@/lib/messaging/templates";
import { SAMPLE_VARS } from "@/lib/messaging/vars";
import {
  broadcastAction,
  reminderSettingsAction,
  resendAction,
  resetTemplateAction,
  saveTemplateAction,
  sendNowAction,
  sendTestAction,
} from "./actions";

export function ResendButton({ messageId }: { messageId: string }) {
  const [state, action] = useActionState(resendAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="messageId" value={messageId} />
      <SubmitButton size="sm" variant="outline" pendingText="…">
        Kirim ulang
      </SubmitButton>
      {state?.error && <p className="text-xs text-status-overdue">{state.error}</p>}
    </form>
  );
}

export function SendNowButton() {
  const [state, action] = useActionState(sendNowAction, undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <SubmitButton variant="outline" pendingText="Mengirim…">
        Kirim antrian sekarang
      </SubmitButton>
      {state && (
        <p className={state.error ? "text-xs text-status-overdue" : "text-xs text-muted-foreground"}>
          {state.error ?? state.message}
        </p>
      )}
    </form>
  );
}

export function TemplateEditor({
  type,
  label,
  body,
  enabled,
}: {
  type: string;
  label: string;
  body: string;
  enabled: boolean;
}) {
  const [state, action] = useActionState(saveTemplateAction, undefined);
  const [resetState, reset] = useActionState(resetTemplateAction, undefined);
  const [text, setText] = useState(body);
  const unknown = missingVariables(text, SAMPLE_VARS);
  return (
    <details className="rounded-lg border">
      <summary className="flex cursor-pointer items-center justify-between gap-2 p-3 font-medium">
        <span>{label}</span>
        {!enabled && (
          <span className="rounded-full bg-status-muted-bg px-2 py-0.5 text-xs text-status-muted">
            Nonaktif
          </span>
        )}
      </summary>
      <div className="grid gap-4 border-t p-3 lg:grid-cols-2">
        <form action={action} className="space-y-3">
          <input type="hidden" name="type" value={type} />
          <Field label="Isi pesan" name="body" state={state} htmlFor={`t-${type}`}>
            <Textarea
              id={`t-${type}`}
              name="body"
              rows={9}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-mono text-sm"
            />
          </Field>
          {unknown.length > 0 && (
            <p className="text-xs text-status-overdue">
              Variabel tidak dikenal: {unknown.map((u) => `{${u}}`).join(", ")}
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={enabled}
              className="size-5 accent-[var(--primary)]"
            />
            Aktif (kirim otomatis)
          </label>
          <FormAlert state={state ?? resetState} />
          <div className="flex gap-2">
            <SubmitButton size="sm">Simpan</SubmitButton>
            <button
              formAction={reset}
              className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted"
              type="submit"
            >
              Kembalikan bawaan
            </button>
          </div>
        </form>
        <div className="space-y-2">
          <p className="text-sm font-medium">Pratinjau</p>
          <div className="rounded-lg bg-[#dcf8c6] p-3 text-sm whitespace-pre-wrap text-black shadow-xs dark:bg-[#005c4b] dark:text-white">
            {renderTemplate(text, SAMPLE_VARS)}
          </div>
          <p className="text-xs text-muted-foreground">
            Variabel:{" "}
            {
              "{nama} {kamar} {periode} {nominal} {sisa} {jatuh_tempo} {rekening} {link_portal} {nama_kos} {denda_info} {hari_telat}"
            }
          </p>
        </div>
      </div>
    </details>
  );
}

export function BroadcastForm() {
  const [state, action] = useActionState(broadcastAction, undefined);
  const [audience, setAudience] = useState("all");
  const [body, setBody] = useState(state?.values?.body ?? "Halo {nama}, ");
  return (
    <form action={action} className="space-y-3">
      <TextField
        label="Judul (untuk catatan)"
        name="title"
        state={state}
        placeholder="Air mati sementara"
        required
      />
      <Field
        label="Isi pengumuman"
        name="body"
        state={state}
        htmlFor="b-body"
        hint="Bisa memakai {nama}, {kamar}, {nama_kos}."
      >
        <Textarea
          id="b-body"
          name="body"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Penerima" name="audience" state={state} htmlFor="b-audience">
          <Select
            id="b-audience"
            name="audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          >
            <option value="all">Semua penghuni aktif</option>
            <option value="floors">Lantai tertentu</option>
          </Select>
        </Field>
        {audience === "floors" && (
          <TextField label="Lantai" name="floors" state={state} placeholder="1, 2" required />
        )}
      </div>
      <FormAlert state={state} />
      <SubmitButton>Kirim pengumuman</SubmitButton>
    </form>
  );
}

export function ReminderSettingsForm({
  settings,
}: {
  settings: { remindersEnabled: boolean; reminderOffsets: number[]; quietStart: string; quietEnd: string };
}) {
  const [state, action] = useActionState(reminderSettingsAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          name="remindersEnabled"
          defaultChecked={settings.remindersEnabled}
          className="size-5 accent-[var(--primary)]"
        />
        Kirim pengingat tagihan otomatis
      </label>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Jadwal pengingat</legend>
        {REMINDER_OPTIONS.map((o) => (
          <label key={o.offset} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name={`offset_${o.offset}`}
              defaultChecked={settings.reminderOffsets.includes(o.offset)}
              className="size-5 accent-[var(--primary)]"
            />
            {o.label}
          </label>
        ))}
        <p className="text-xs text-muted-foreground">Pengingat berhenti otomatis begitu tagihan lunas.</p>
      </fieldset>
      <div className="grid max-w-sm grid-cols-2 gap-3">
        <TextField
          label="Jam tenang mulai"
          name="quietStart"
          state={state}
          type="time"
          defaultValue={settings.quietStart.slice(0, 5)}
        />
        <TextField
          label="Sampai"
          name="quietEnd"
          state={state}
          type="time"
          defaultValue={settings.quietEnd.slice(0, 5)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Pesan tidak dikirim di jam tenang, ditunda sampai jam tenang berakhir.
      </p>
      <FormAlert state={state} />
      <SubmitButton>Simpan</SubmitButton>
    </form>
  );
}

export function SendTestForm({ defaultPhone }: { defaultPhone: string | null }) {
  const [state, action] = useActionState(sendTestAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <TextField
        label="Kirim pesan uji ke"
        name="phone"
        state={state}
        inputMode="tel"
        placeholder="0812 3456 7890"
        defaultValue={defaultPhone ? `0${defaultPhone.slice(2)}` : ""}
        className="min-w-56 flex-1"
      />
      <SubmitButton variant="outline" pendingText="Mengirim…">
        Kirim uji
      </SubmitButton>
      <div className="basis-full">
        <FormAlert state={state} />
      </div>
    </form>
  );
}
