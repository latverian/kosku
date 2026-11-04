/** Validasi file unggahan (NFR-4: tipe & ukuran dibatasi) — murni. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type Bucket = "payment-proofs" | "complaint-photos" | "id-cards" | "receipts";

const ALLOWED: Record<Bucket, Record<string, string>> = {
  "payment-proofs": {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  },
  "complaint-photos": { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  "id-cards": { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  receipts: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" },
};

export function validateUpload(
  bucket: Bucket,
  file: { type: string; size: number },
): { ok: true; ext: string } | { ok: false; error: string } {
  const ext = ALLOWED[bucket][file.type];
  if (!ext) {
    return {
      ok: false,
      error:
        bucket === "payment-proofs"
          ? "Format file harus JPG, PNG, WEBP, atau PDF."
          : "Format foto harus JPG, PNG, atau WEBP.",
    };
  }
  if (file.size <= 0) return { ok: false, error: "File kosong." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Ukuran file maksimal 5 MB." };
  return { ok: true, ext };
}

/** Path acak per properti & bulan; tidak memuat nama asli file (privasi). */
export function storagePath(propertyId: string, ext: string, id: string, now = new Date()): string {
  const month = now.toISOString().slice(0, 7);
  return `${propertyId}/${month}/${id}.${ext}`;
}

/** Cegah path traversal pada penyimpanan lokal. */
export function isSafeStoragePath(path: string): boolean {
  return /^[0-9a-f-]{36}\/\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(path);
}
