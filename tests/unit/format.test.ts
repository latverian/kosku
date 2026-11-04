import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatPeriod,
  formatRupiah,
  formatRupiahShort,
  maskNik,
  normalizePhone,
} from "@/lib/format";

describe("format", () => {
  it("Rupiah", () => {
    expect(formatRupiah(1_500_000)).toBe("Rp1.500.000");
    expect(formatRupiah(0)).toBe("Rp0");
    expect(() => formatRupiah(1.5)).toThrow(TypeError);
  });

  it("Rupiah singkat", () => {
    expect(formatRupiahShort(13_500_000)).toBe("Rp13,5 jt");
    expect(formatRupiahShort(750_000)).toBe("Rp750 rb");
    expect(formatRupiahShort(500)).toBe("Rp500");
  });

  it("tanggal & periode", () => {
    expect(formatDate("2026-11-05")).toBe("5 Nov 2026");
    // 4 Nov 20.00 UTC = 5 Nov 03.00 WIB
    expect(formatDate(new Date("2026-11-04T20:00:00Z"))).toBe("5 Nov 2026");
    expect(formatPeriod("2026-11-01")).toBe("November 2026");
  });

  it("NIK tersamar", () => {
    expect(maskNik("3273010101900001")).toBe("3273********0001");
  });

  it("normalisasi nomor WA", () => {
    expect(normalizePhone("0812-3456-7890")).toBe("6281234567890");
    expect(normalizePhone("+62 812 3456 7890")).toBe("6281234567890");
    expect(normalizePhone("81234567890")).toBe("6281234567890");
    expect(normalizePhone("12345")).toBeNull();
  });
});
