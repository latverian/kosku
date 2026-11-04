import { describe, expect, it } from "vitest";
import { z } from "zod";
import { checkbox, money, optionalIsoDate, parseRupiah, phone } from "@/lib/validation";

describe("validasi form", () => {
  it("parse Rupiah dari berbagai format", () => {
    expect(parseRupiah("1.500.000")).toBe(1_500_000);
    expect(parseRupiah("Rp 1.500.000")).toBe(1_500_000);
    expect(parseRupiah("")).toBeNull();
  });

  it("skema uang & telepon", () => {
    const schema = z.object({
      price: money("Harga"),
      wa: phone("No. WA"),
      ok: checkbox,
      end: optionalIsoDate,
    });
    expect(schema.parse({ price: "1.800.000", wa: "0812-3456-7890", ok: "on", end: "" })).toEqual({
      price: 1_800_000,
      wa: "6281234567890",
      ok: true,
      end: null,
    });
    const bad = schema.safeParse({ price: "", wa: "123", end: "x" });
    expect(bad.success).toBe(false);
  });
});
