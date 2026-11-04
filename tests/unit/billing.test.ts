import { describe, expect, it } from "vitest";
import {
  addMonths,
  computeInvoiceStatus,
  daysBetween,
  defaultBillingDay,
  displayStatus,
  dueDate,
  firstPeriod,
  invoiceNumber,
  isOverdue,
  lateFee,
  periodOf,
  prorate,
  todayIn,
} from "@/lib/billing";

describe("tanggal tagihan", () => {
  it("jatuh tempo = tanggal tagih di periode itu", () => {
    expect(dueDate("2026-11-01", 5)).toBe("2026-11-05");
  });

  it("tanggal tagih 28 valid di Februari kabisat & non-kabisat", () => {
    expect(dueDate("2028-02-01", 28)).toBe("2028-02-28");
    expect(dueDate("2027-02-01", 28)).toBe("2027-02-28");
  });

  it("menolak tanggal tagih di luar 1–28", () => {
    expect(() => dueDate("2026-11-01", 29)).toThrow(RangeError);
    expect(() => dueDate("2026-11-01", 0)).toThrow(RangeError);
  });

  it("tanggal tagih default mengikuti tanggal masuk, maksimum 28", () => {
    expect(defaultBillingDay("2026-11-05")).toBe(5);
    expect(defaultBillingDay("2026-10-31")).toBe(28);
  });

  it("periode & penambahan bulan melewati pergantian tahun", () => {
    expect(periodOf("2026-11-17")).toBe("2026-11-01");
    expect(addMonths("2026-11-01", 2)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("periode pertama sewa", () => {
    expect(firstPeriod("2026-11-05", 5)).toBe("2026-11-01");
    expect(firstPeriod("2026-11-20", 5)).toBe("2026-12-01");
  });

  it("lead 7 hari: tagihan Desember (jatuh tempo 5 Des) dibuat 28 Nov", () => {
    const due = dueDate("2026-12-01", 5);
    expect(daysBetween("2026-11-27", due)).toBe(8); // belum
    expect(daysBetween("2026-11-28", due)).toBe(7); // dibuat
  });

  it("hari ini mengikuti zona waktu properti (07.00 WIB = 00.00 UTC)", () => {
    const now = new Date("2026-11-30T17:30:00Z"); // 1 Des 00.30 WIB
    expect(todayIn("Asia/Jakarta", now)).toBe("2026-12-01");
    expect(todayIn("UTC", now)).toBe("2026-11-30");
  });
});

describe("prorata", () => {
  it("masuk 20 Nov, Rp1.500.000, 30 hari → 11 hari → Rp550.000", () => {
    expect(prorate(1_500_000, "2026-11-20")).toBe(550_000);
  });

  it("dibulatkan ke atas ke ribuan", () => {
    // 1.000.000 × 10/31 = 322.580,6 → 323.000
    expect(prorate(1_000_000, "2026-12-22")).toBe(323_000);
  });

  it("masuk tanggal 1 = harga penuh", () => {
    expect(prorate(1_500_000, "2026-11-01")).toBe(1_500_000);
  });
});

describe("status tagihan", () => {
  it("bayar sebagian lalu lunas", () => {
    expect(computeInvoiceStatus({ current: "issued", total: 1_500_000, paidAmount: 500_000 })).toBe(
      "partial",
    );
    expect(computeInvoiceStatus({ current: "partial", total: 1_500_000, paidAmount: 1_500_000 })).toBe(
      "paid",
    );
  });

  it("kelebihan bayar tetap lunas", () => {
    expect(computeInvoiceStatus({ current: "issued", total: 1_500_000, paidAmount: 1_600_000 })).toBe("paid");
  });

  it("pembayaran ditolak → kembali belum dibayar", () => {
    expect(computeInvoiceStatus({ current: "paid", total: 1_500_000, paidAmount: 0 })).toBe("issued");
  });

  it("tagihan batal tidak berubah status", () => {
    expect(computeInvoiceStatus({ current: "void", total: 1_500_000, paidAmount: 1_500_000 })).toBe("void");
  });

  it("terlambat adalah kondisi turunan", () => {
    expect(isOverdue({ status: "issued", dueDate: "2026-11-05" }, "2026-11-06")).toBe(true);
    expect(isOverdue({ status: "issued", dueDate: "2026-11-05" }, "2026-11-05")).toBe(false);
    expect(isOverdue({ status: "paid", dueDate: "2026-11-05" }, "2026-12-01")).toBe(false);
  });

  it("status tampilan memprioritaskan bukti yang menunggu verifikasi", () => {
    expect(
      displayStatus({ status: "issued", dueDate: "2026-11-05", hasPendingPayment: true }, "2026-11-10"),
    ).toBe("pending");
    expect(displayStatus({ status: "partial", dueDate: "2026-11-05" }, "2026-11-10")).toBe("overdue");
    expect(displayStatus({ status: "partial", dueDate: "2026-11-15" }, "2026-11-10")).toBe("partial");
  });

  it("nomor tagihan", () => {
    expect(invoiceNumber("MLT", "2026-11-01", "12")).toBe("KSK-MLT-202611-12");
    expect(invoiceNumber("mlt", "2026-11-01", "A-03")).toBe("KSK-MLT-202611-A03");
  });
});

describe("denda keterlambatan", () => {
  const daily = { type: "daily" as const, amount: 5_000, graceDays: 3 };

  it("harian Rp5.000, tenggang 3 hari, telat 5 hari → Rp10.000", () => {
    expect(lateFee(daily, "2026-11-05", "2026-11-10")).toBe(10_000);
  });

  it("tidak ada denda selama masa tenggang", () => {
    expect(lateFee(daily, "2026-11-05", "2026-11-08")).toBe(0);
  });

  it("denda tidak melebihi batas maksimum", () => {
    expect(lateFee({ ...daily, max: 50_000 }, "2026-11-05", "2026-12-31")).toBe(50_000);
  });

  it("denda tetap dikenakan sekali", () => {
    const fixed = { type: "fixed" as const, amount: 50_000, graceDays: 3 };
    expect(lateFee(fixed, "2026-11-05", "2026-11-09")).toBe(50_000);
    expect(lateFee(fixed, "2026-11-05", "2026-12-31")).toBe(50_000);
  });

  it("tanpa aturan denda", () => {
    expect(lateFee({ type: "none" }, "2026-11-05", "2026-12-31")).toBe(0);
  });
});
