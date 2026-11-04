"use client";

import { Camera, Copy, Check, Star } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Field, FormAlert, SubmitButton, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { compressImage } from "@/lib/image-compress";
import { cn } from "@/lib/utils";
import type { FormState } from "@/server/form-state";
import {
  commentAction,
  createComplaintAction,
  payOnlineAction,
  rateAction,
  uploadProofAction,
} from "./actions";

export function CopyButton({ text, label = "Salin" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Tersalin" : label}
    </Button>
  );
}

/** Form yang mengompres foto di browser sebelum dikirim. */
function useCompressedSubmit(
  action: (state: FormState, formData: FormData) => Promise<FormState>,
  fileFields: string[],
) {
  const [state, dispatch, submitting] = useActionState(action, undefined);
  const [compressing, startTransition] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    startTransition(async () => {
      const data = new FormData(form);
      for (const field of fileFields) {
        const files = data.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
        data.delete(field);
        for (const f of files) data.append(field, await compressImage(f));
      }
      // Setelah await, React sudah keluar dari transition → bungkus lagi
      startTransition(() => dispatch(data));
    });
  };
  return { state, onSubmit, pending: compressing || submitting };
}

export function UploadProofForm({
  token,
  invoiceId,
  remaining,
  today,
}: {
  token: string;
  invoiceId: string;
  remaining: number;
  today: string;
}) {
  const { state, onSubmit, pending } = useCompressedSubmit(uploadProofAction, ["proof"]);
  const [fileName, setFileName] = useState("");
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Field label="Foto bukti transfer" name="proof" state={state} htmlFor={`proof-${invoiceId}`}>
        <label
          htmlFor={`proof-${invoiceId}`}
          className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center text-sm text-muted-foreground hover:bg-muted/60"
        >
          <Camera className="size-6" aria-hidden />
          {fileName || "Ketuk untuk memilih foto / screenshot"}
        </label>
        <input
          id={`proof-${invoiceId}`}
          name="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          required
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Nominal (Rp)"
          name="amount"
          state={state}
          inputMode="numeric"
          defaultValue={remaining.toLocaleString("id-ID")}
          required
        />
        <TextField
          label="Tanggal transfer"
          name="paidAt"
          state={state}
          type="date"
          defaultValue={today}
          required
        />
      </div>
      <TextField
        label="Catatan (opsional)"
        name="notes"
        state={state}
        placeholder="Transfer dari rekening a.n. …"
      />
      <FormAlert state={state} />
      <SubmitButton className="w-full" disabled={pending} pendingText="Mengirim…">
        {pending ? "Menyiapkan foto…" : "Kirim bukti bayar"}
      </SubmitButton>
    </form>
  );
}

const CATEGORIES = [
  ["ac", "AC"],
  ["electricity", "Listrik"],
  ["water", "Air"],
  ["internet", "Internet / WiFi"],
  ["cleanliness", "Kebersihan"],
  ["facility", "Fasilitas"],
  ["security", "Keamanan"],
  ["neighbor", "Tetangga / kebisingan"],
  ["other", "Lainnya"],
] as const;

export function ComplaintForm({ token }: { token: string }) {
  const { state, onSubmit, pending } = useCompressedSubmit(createComplaintAction, ["photos"]);
  const [count, setCount] = useState(0);
  const [common, setCommon] = useState(false);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kategori" name="category" state={state} htmlFor="c-category">
          <Select id="c-category" name="category" defaultValue={state?.values?.category ?? "ac"}>
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Seberapa mendesak?" name="priority" state={state} htmlFor="c-priority">
          <Select id="c-priority" name="priority" defaultValue={state?.values?.priority ?? "medium"}>
            <option value="low">Bisa menunggu</option>
            <option value="medium">Sedang</option>
            <option value="high">Penting</option>
            <option value="urgent">Darurat</option>
          </Select>
        </Field>
      </div>
      <TextField
        label="Masalahnya apa?"
        name="title"
        state={state}
        placeholder="AC tidak dingin"
        required
        maxLength={120}
      />
      <Field label="Ceritakan detailnya" name="description" state={state} htmlFor="c-description">
        <Textarea
          id="c-description"
          name="description"
          rows={3}
          defaultValue={state?.values?.description ?? ""}
          placeholder="Sejak kapan, sudah dicoba apa, dll."
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={common}
          onChange={(e) => setCommon(e.target.checked)}
          className="size-5 accent-[var(--primary)]"
        />
        Masalah di area umum (bukan di kamar saya)
      </label>
      {common && (
        <TextField label="Lokasi" name="location" state={state} placeholder="Dapur lantai 2" required />
      )}
      <Field
        label={`Foto (opsional, maks. 5)${count ? ` · ${count} dipilih` : ""}`}
        name="photos"
        state={state}
        htmlFor="c-photos"
      >
        <Input
          id="c-photos"
          name="photos"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => setCount(e.target.files?.length ?? 0)}
        />
      </Field>
      <FormAlert state={state} />
      <SubmitButton className="w-full" disabled={pending} pendingText="Mengirim…">
        {pending ? "Menyiapkan foto…" : "Kirim laporan"}
      </SubmitButton>
    </form>
  );
}

export function CommentForm({ token, complaintId }: { token: string; complaintId: string }) {
  const [state, action] = useActionState(commentAction, undefined);
  // Form direset otomatis oleh React setelah action selesai
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="complaintId" value={complaintId} />
      <Textarea
        name="body"
        rows={2}
        required
        placeholder="Tulis pesan untuk pengelola…"
        aria-label="Komentar"
      />
      <FormAlert state={state} />
      <SubmitButton size="sm">Kirim</SubmitButton>
    </form>
  );
}

export function RatingForm({
  token,
  complaintId,
  current,
}: {
  token: string;
  complaintId: string;
  current: number | null;
}) {
  const [state, action] = useActionState(rateAction, undefined);
  const [hover, setHover] = useState(0);
  const value = hover || current || 0;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="complaintId" value={complaintId} />
      <p className="text-sm font-medium">{current ? "Penilaian kamu" : "Puas dengan penanganannya?"}</p>
      <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="submit"
            name="rating"
            value={n}
            aria-label={`${n} bintang`}
            onMouseEnter={() => setHover(n)}
            className="grid size-11 place-items-center rounded-lg hover:bg-muted"
          >
            <Star
              className={cn(
                "size-7",
                n <= value ? "fill-status-pending text-status-pending" : "text-muted-foreground",
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
      <FormAlert state={state} />
    </form>
  );
}

export function PayOnlineButton({ token, invoiceId }: { token: string; invoiceId: string }) {
  const [state, action] = useActionState(payOnlineAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <SubmitButton className="w-full" pendingText="Membuka halaman bayar…">
        Bayar online (VA / QRIS / e-wallet)
      </SubmitButton>
      <p className="text-center text-xs text-muted-foreground">Lunas otomatis begitu pembayaran berhasil.</p>
      <FormAlert state={state} />
    </form>
  );
}
