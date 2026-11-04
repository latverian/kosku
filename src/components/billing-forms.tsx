"use client";

import { Check, MessageCircle, Trash2, X } from "lucide-react";
import { useActionState, useState } from "react";
import {
  addItemAction,
  generateNowAction,
  recordPaymentAction,
  rejectPaymentAction,
  remindNowAction,
  removeItemAction,
  verifyPaymentAction,
  voidInvoiceAction,
} from "@/app/(dashboard)/tagihan/actions";
import { Field, FormAlert, MoneyField, SubmitButton, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate, formatRupiah } from "@/lib/format";
import { ITEM_TYPE_LABEL } from "@/lib/labels";

export function GenerateNowButton() {
  const [state, action] = useActionState(generateNowAction, undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <SubmitButton variant="outline" pendingText="Memproses…">
        Buat tagihan sekarang
      </SubmitButton>
      {state && (
        <p
          role="status"
          className={state.error ? "text-xs text-status-overdue" : "text-xs text-muted-foreground"}
        >
          {state.error ?? state.message}
        </p>
      )}
    </form>
  );
}

export function AddItemForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState(addItemAction, undefined);
  const [type, setType] = useState("electricity");
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_10rem]">
        <Field label="Jenis" name="type" state={state} htmlFor="item-type">
          <Select id="item-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {(["electricity", "water", "laundry", "late_fee", "discount", "other"] as const).map((t) => (
              <option key={t} value={t}>
                {ITEM_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <TextField
          label="Keterangan"
          name="description"
          state={state}
          placeholder={
            type === "electricity"
              ? "Listrik Oktober (85 kWh)"
              : type === "discount"
                ? "Diskon mahasiswa baru"
                : ""
          }
          required
        />
        <MoneyField
          label={type === "discount" ? "Potongan (Rp)" : "Nominal (Rp)"}
          name="amount"
          state={state}
          required
        />
      </div>
      <FormAlert state={state} />
      <SubmitButton size="sm">Tambah item</SubmitButton>
    </form>
  );
}

export function RemoveItemButton({ itemId }: { itemId: string }) {
  const [state, action] = useActionState(removeItemAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Hapus item ini?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="itemId" value={itemId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        aria-label="Hapus item"
        className="size-9 text-muted-foreground"
        title={state?.error}
      >
        <Trash2 aria-hidden />
      </Button>
      {state?.error && <span className="text-xs text-status-overdue">{state.error}</span>}
    </form>
  );
}

export function VoidInvoiceForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState(voidInvoiceAction, undefined);
  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(e) => {
        if (!confirm("Batalkan tagihan ini? Tindakan ini tercatat dan tidak bisa dibatalkan."))
          e.preventDefault();
      }}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <TextField
        label="Alasan pembatalan"
        name="reason"
        state={state}
        required
        placeholder="Salah nominal, penghuni batal masuk, …"
      />
      <FormAlert state={state} />
      <SubmitButton variant="destructive" size="sm">
        Batalkan tagihan
      </SubmitButton>
    </form>
  );
}

export type OpenInvoice = {
  id: string;
  number: string;
  dueDate: string;
  total: number;
  paidAmount: number;
  tenantName: string;
  roomCode: string;
};

export function RecordPaymentForm({
  invoices,
  invoiceId,
  today,
}: {
  invoices: OpenInvoice[];
  invoiceId?: string;
  today: string;
}) {
  const [state, action] = useActionState(recordPaymentAction, undefined);
  const [selected, setSelected] = useState(state?.values?.invoiceId ?? invoiceId ?? "");
  const invoice = invoices.find((i) => i.id === selected);
  const remaining = invoice ? Math.max(0, invoice.total - invoice.paidAmount) : 0;
  const [amount, setAmount] = useState(remaining ? remaining.toLocaleString("id-ID") : "");

  return (
    <form action={action} className="space-y-4">
      {invoiceId ? (
        <input type="hidden" name="invoiceId" value={invoiceId} />
      ) : (
        <Field label="Tagihan" name="invoiceId" state={state} htmlFor="payment-invoice">
          <Select
            id="payment-invoice"
            name="invoiceId"
            value={selected}
            required
            onChange={(e) => {
              setSelected(e.target.value);
              const inv = invoices.find((i) => i.id === e.target.value);
              setAmount(inv ? Math.max(0, inv.total - inv.paidAmount).toLocaleString("id-ID") : "");
            }}
          >
            <option value="">Pilih kamar / tagihan</option>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                Kamar {i.roomCode} · {i.tenantName} · sisa {formatRupiah(i.total - i.paidAmount)} ·{" "}
                {formatDate(i.dueDate)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Nominal diterima (Rp)"
          name="amount"
          state={state}
          hint={invoice ? `Sisa tagihan ${formatRupiah(remaining)}` : undefined}
          htmlFor="payment-amount"
        >
          <Input
            id="payment-amount"
            name="amount"
            inputMode="numeric"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Metode" name="method" state={state} htmlFor="payment-method">
          <Select id="payment-method" name="method" defaultValue={state?.values?.method ?? "transfer"}>
            <option value="transfer">Transfer</option>
            <option value="cash">Tunai</option>
            <option value="qris">QRIS</option>
            <option value="ewallet">E-wallet</option>
            <option value="va">Virtual Account</option>
            <option value="other">Lainnya</option>
          </Select>
        </Field>
        <TextField
          label="Tanggal bayar"
          name="paidAt"
          state={state}
          type="date"
          defaultValue={today}
          required
        />
      </div>
      <TextField label="Catatan (opsional)" name="notes" state={state} placeholder="Dibayar ke Pak Joko" />
      <p className="text-xs text-muted-foreground">
        Kelebihan bayar otomatis menjadi saldo dan dipakai di tagihan berikutnya.
      </p>
      <FormAlert state={state} />
      <SubmitButton>Catat pembayaran</SubmitButton>
    </form>
  );
}

export function VerifyRejectButtons({ paymentId }: { paymentId: string }) {
  const [verifyState, verify] = useActionState(verifyPaymentAction, undefined);
  const [rejectState, reject] = useActionState(rejectPaymentAction, undefined);
  const [rejecting, setRejecting] = useState(false);
  const error = verifyState?.error ?? rejectState?.error;

  return (
    <div className="space-y-2">
      {rejecting ? (
        <form action={reject} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="paymentId" value={paymentId} />
          <Input
            name="reason"
            placeholder="Alasan penolakan"
            required
            aria-label="Alasan penolakan"
            className="h-9 min-w-48 flex-1"
          />
          <SubmitButton size="sm" variant="destructive" pendingText="…">
            Tolak
          </SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)}>
            Batal
          </Button>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(true)}>
            <X aria-hidden /> Tolak
          </Button>
          <form action={verify}>
            <input type="hidden" name="paymentId" value={paymentId} />
            <SubmitButton size="sm" pendingText="…">
              <Check aria-hidden /> Verifikasi
            </SubmitButton>
          </form>
        </div>
      )}
      {error && <p className="text-xs text-status-overdue">{error}</p>}
    </div>
  );
}

export function RemindNowButton({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState(remindNowAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <SubmitButton variant="outline" className="w-full" pendingText="Mengirim…">
        <MessageCircle aria-hidden /> Kirim pengingat WA otomatis
      </SubmitButton>
      <FormAlert state={state} />
    </form>
  );
}
