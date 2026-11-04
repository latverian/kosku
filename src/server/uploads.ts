import "server-only";
import { randomUUID } from "node:crypto";
import { storagePath, validateUpload, type Bucket } from "@/lib/uploads";
import { ServiceError } from "@/services/core";
import { storageFromEnv } from "@/services/storage";

/** Simpan File dari FormData ke storage privat. Lempar ServiceError bila tidak valid. */
export async function saveUpload(bucket: Bucket, propertyId: string, file: File, field = "file") {
  const check = validateUpload(bucket, file);
  if (!check.ok) throw new ServiceError(check.error, field);
  const path = storagePath(propertyId, check.ext, randomUUID());
  await storageFromEnv().put(bucket, path, new Uint8Array(await file.arrayBuffer()), file.type);
  return { path, mimeType: file.type, sizeBytes: file.size };
}

export async function signedUrl(bucket: Bucket, path: string | null) {
  if (!path) return null;
  try {
    return await storageFromEnv().signedUrl(bucket, path);
  } catch {
    return null;
  }
}

/** File dari FormData (abaikan input file kosong). */
export function filesOf(formData: FormData, name: string): File[] {
  return formData.getAll(name).filter((f): f is File => f instanceof File && f.size > 0);
}
