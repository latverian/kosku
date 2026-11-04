/**
 * Token portal penghuni (FR-8.1, FR-8.3).
 *
 * Token = HMAC-SHA256(PORTAL_SECRET, "<tenantId>:<versi>") dalam base64url.
 * Database hanya menyimpan SHA-256 dari token (untuk pencarian), jadi token
 * tidak pernah tersimpan polos, tetapi server tetap bisa menyusunnya ulang
 * untuk dimasukkan ke pesan WA. Mencabut link = menaikkan versi.
 */
import { createHash, createHmac } from "node:crypto";

export function portalToken(secret: string, tenantId: string, version: number): string {
  if (!secret || secret.length < 16) throw new Error("PORTAL_SECRET minimal 16 karakter.");
  return createHmac("sha256", secret).update(`${tenantId}:${version}`).digest("base64url");
}

export function hashPortalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function looksLikePortalToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
