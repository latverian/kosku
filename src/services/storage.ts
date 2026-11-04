/**
 * Penyimpanan file privat (foto bukti bayar, komplain, KTP).
 * - Production: Supabase Storage (bucket privat, service role, signed URL 10 menit).
 * - Development tanpa Supabase: disk lokal `.data/uploads` + URL bertanda tangan
 *   HMAC yang dilayani /api/files.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { isSafeStoragePath, type Bucket } from "@/lib/uploads";

export const SIGNED_URL_SECONDS = 600;

export interface FileStorage {
  readonly name: string;
  put(bucket: Bucket, path: string, data: Uint8Array, contentType: string): Promise<void>;
  signedUrl(bucket: Bucket, path: string, expiresInSeconds?: number): Promise<string | null>;
}

export class SupabaseStorage implements FileStorage {
  readonly name = "supabase";
  private readonly client;
  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  async put(bucket: Bucket, path: string, data: Uint8Array, contentType: string) {
    const { error } = await this.client.storage
      .from(bucket)
      .upload(path, data, { contentType, upsert: false });
    if (error) throw new Error(`Gagal menyimpan file: ${error.message}`);
  }
  async signedUrl(bucket: Bucket, path: string, expiresInSeconds = SIGNED_URL_SECONDS) {
    const { data, error } = await this.client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    return error ? null : data.signedUrl;
  }
}

export class LocalStorage implements FileStorage {
  readonly name = "local";
  constructor(
    private readonly root: string,
    private readonly secret: string,
    private readonly appUrl: string,
  ) {}

  private file(bucket: Bucket, path: string) {
    if (!isSafeStoragePath(path)) throw new Error("Path file tidak valid");
    return join(this.root, bucket, path);
  }
  // contentType tidak perlu disimpan: tipe ditentukan dari ekstensi saat dibaca
  async put(bucket: Bucket, path: string, data: Uint8Array, _contentType?: string) {
    void _contentType;
    const target = this.file(bucket, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  }
  sign(bucket: string, path: string, exp: number) {
    return createHmac("sha256", this.secret).update(`${bucket}/${path}:${exp}`).digest("base64url");
  }
  async signedUrl(bucket: Bucket, path: string, expiresInSeconds = SIGNED_URL_SECONDS) {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `${this.appUrl}/api/files/${bucket}/${path}?exp=${exp}&sig=${this.sign(bucket, path, exp)}`;
  }
  /** Validasi tanda tangan URL lalu baca file; null bila tidak sah/kedaluwarsa. */
  async read(bucket: Bucket, path: string, exp: number, sig: string): Promise<Buffer | null> {
    if (!Number.isFinite(exp) || exp < Date.now() / 1000) return null;
    const expected = Buffer.from(this.sign(bucket, path, exp));
    const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
      return await readFile(this.file(bucket, path));
    } catch {
      return null;
    }
  }
}

export function storageFromEnv(env: Record<string, string | undefined> = process.env): FileStorage {
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseStorage(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  if (env.NODE_ENV === "production") {
    throw new Error("Penyimpanan file belum dikonfigurasi: isi SUPABASE_SERVICE_ROLE_KEY.");
  }
  return new LocalStorage(
    join(process.cwd(), ".data", "uploads"),
    env.PORTAL_SECRET || "dev-only-local-storage-secret",
    (env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  );
}
