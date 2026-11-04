import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSafeStoragePath, storagePath, validateUpload } from "@/lib/uploads";
import { LocalStorage } from "@/services/storage";

const uuid = "11111111-2222-4333-8444-555555555555";

describe("unggahan", () => {
  it("validasi tipe & ukuran", () => {
    expect(validateUpload("payment-proofs", { type: "application/pdf", size: 1000 })).toEqual({
      ok: true,
      ext: "pdf",
    });
    expect(validateUpload("complaint-photos", { type: "application/pdf", size: 1000 }).ok).toBe(false);
    expect(validateUpload("complaint-photos", { type: "image/jpeg", size: 6 * 1024 * 1024 }).ok).toBe(false);
    expect(validateUpload("complaint-photos", { type: "image/svg+xml", size: 10 }).ok).toBe(false);
  });

  it("path aman, tanpa traversal", () => {
    const path = storagePath(uuid, "jpg", uuid, new Date("2026-11-04"));
    expect(path).toBe(`${uuid}/2026-11/${uuid}.jpg`);
    expect(isSafeStoragePath(path)).toBe(true);
    expect(isSafeStoragePath(`../${path}`)).toBe(false);
    expect(isSafeStoragePath(`${uuid}/2026-11/../../etc.jpg`)).toBe(false);
  });

  it("penyimpanan lokal: URL bertanda tangan, kedaluwarsa, dan tidak bisa dipalsukan", async () => {
    const storage = new LocalStorage(
      await mkdtemp(join(tmpdir(), "kosku-")),
      "rahasia-uji-0123456789",
      "http://x",
    );
    const path = storagePath(uuid, "jpg", uuid);
    await storage.put("payment-proofs", path, new Uint8Array([1, 2, 3]), "image/jpeg");
    const url = new URL((await storage.signedUrl("payment-proofs", path))!);
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig")!;
    expect(await storage.read("payment-proofs", path, exp, sig)).toEqual(Buffer.from([1, 2, 3]));
    expect(await storage.read("payment-proofs", path, exp + 1, sig)).toBeNull(); // exp diubah
    expect(await storage.read("complaint-photos", path, exp, sig)).toBeNull(); // bucket lain
    expect(
      await storage.read(
        "payment-proofs",
        path,
        Math.floor(Date.now() / 1000) - 1,
        storage.sign("payment-proofs", path, Math.floor(Date.now() / 1000) - 1),
      ),
    ).toBeNull();
  });
});
