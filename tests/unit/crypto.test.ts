import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptText, encryptText } from "@/lib/crypto";

const key = randomBytes(32).toString("base64");

describe("enkripsi NIK", () => {
  it("bolak-balik dan acak setiap kali", () => {
    const a = encryptText("3273010101900001", key);
    const b = encryptText("3273010101900001", key);
    expect(a).not.toBe(b);
    expect(decryptText(a, key)).toBe("3273010101900001");
  });

  it("menolak kunci salah atau data diubah", () => {
    const enc = encryptText("3273010101900001", key);
    expect(() => decryptText(enc, randomBytes(32).toString("base64"))).toThrow();
    const parts = enc.split(":");
    parts[3] = Buffer.from("x").toString("base64");
    expect(() => decryptText(parts.join(":"), key)).toThrow();
  });

  it("menolak kunci yang bukan 32 byte", () => {
    expect(() => encryptText("1", Buffer.from("pendek").toString("base64"))).toThrow(/32 byte/);
  });
});
