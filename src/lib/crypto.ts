/**
 * Enkripsi NIK (NFR-4) dengan AES-256-GCM.
 * Kunci: NIK_ENCRYPTION_KEY = 32 byte acak dalam base64
 *   (buat dengan: openssl rand -base64 32)
 * Format tersimpan: "v1:<iv>:<tag>:<ciphertext>" (base64).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyFrom(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("NIK_ENCRYPTION_KEY harus 32 byte (base64).");
  return key;
}

export function encryptText(plain: string, keyBase64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(keyBase64), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(
    ":",
  );
}

export function decryptText(payload: string, keyBase64: string): string {
  const [version, iv, tag, ct] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Format data terenkripsi tidak dikenal.");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(keyBase64), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}
