import { describe, expect, it } from "vitest";
import { cycleContaining, planInvoices, type LeaseTerms } from "@/lib/billing";

const rules = { invoiceLeadDays: 7, prorateFirstMonth: true };
const lease = (over: Partial<LeaseTerms> = {}): LeaseTerms => ({
  startDate: "2026-11-05",
  endDate: null,
  billingDay: 5,
  monthlyRent: 1_500_000,
  billingStartPeriod: null,
  ...over,
});

describe("siklus", () => {
  it("menentukan periode siklus yang memuat tanggal", () => {
    expect(cycleContaining("2026-11-05", 5)).toBe("2026-11-01");
    expect(cycleContaining("2026-11-04", 5)).toBe("2026-10-01");
    expect(cycleContaining("2026-01-03", 5)).toBe("2025-12-01");
  });
});

describe("rencana tagihan", () => {
  it("masuk tepat tanggal tagih → tagihan penuh jatuh tempo hari masuk", () => {
    expect(planInvoices(lease(), rules, "2026-11-05")).toEqual([
      {
        period: "2026-11-01",
        dueDate: "2026-11-05",
        coversFrom: "2026-11-05",
        coversTo: "2026-12-05",
        rent: 1_500_000,
        prorated: false,
      },
    ]);
  });

  it("tagihan berikutnya dibuat 7 hari sebelum jatuh tempo (28 Nov untuk 5 Des)", () => {
    const existing = new Set(["2026-11-01"]);
    expect(planInvoices(lease(), rules, "2026-11-27", existing)).toEqual([]);
    expect(planInvoices(lease(), rules, "2026-11-28", existing).map((p) => p.period)).toEqual(["2026-12-01"]);
  });

  it("prorata: tagih tgl 1, masuk 20 Nov, Rp1.500.000 → Rp550.000", () => {
    const [first] = planInvoices(lease({ startDate: "2026-11-20", billingDay: 1 }), rules, "2026-11-20");
    expect(first).toMatchObject({
      period: "2026-11-01",
      dueDate: "2026-11-20",
      coversTo: "2026-12-01",
      rent: 550_000,
      prorated: true,
    });
  });

  it("prorata nonaktif → bulan pertama ditagih penuh", () => {
    const [first] = planInvoices(
      lease({ startDate: "2026-11-20", billingDay: 1 }),
      { ...rules, prorateFirstMonth: false },
      "2026-11-20",
    );
    expect(first).toMatchObject({ rent: 1_500_000, prorated: false });
  });

  it("masuk sebelum tanggal tagih di bulan yang sama → siklus bulan lalu", () => {
    const [first, second] = planInvoices(lease({ startDate: "2026-11-03" }), rules, "2026-11-03");
    expect(first).toMatchObject({
      period: "2026-10-01",
      dueDate: "2026-11-03",
      coversTo: "2026-11-05",
      prorated: true,
    });
    // 2 dari 31 hari (5 Okt–5 Nov) × 1.500.000 = 96.774 → 97.000
    expect(first.rent).toBe(97_000);
    expect(second).toMatchObject({ period: "2026-11-01", dueDate: "2026-11-05", rent: 1_500_000 });
  });

  it("idempoten: periode yang sudah ada tidak direncanakan lagi", () => {
    const all = planInvoices(lease(), rules, "2027-01-01");
    const again = planInvoices(lease(), rules, "2027-01-01", new Set(all.map((p) => p.period)));
    expect(all.map((p) => p.period)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
    expect(again).toEqual([]);
  });

  it("check-out: tagihan yang jatuh tempo pada/setelah tanggal keluar tidak dibuat", () => {
    const plans = planInvoices(lease({ endDate: "2027-01-05" }), rules, "2027-02-01");
    expect(plans.map((p) => p.period)).toEqual(["2026-11-01", "2026-12-01"]);
  });

  it("penghuni lama: periode sebelum billingStartPeriod dilewati", () => {
    const plans = planInvoices(
      lease({ startDate: "2025-03-05", billingStartPeriod: "2026-11-01" }),
      rules,
      "2026-11-10",
    );
    expect(plans.map((p) => p.period)).toEqual(["2026-11-01"]);
  });

  it("dibatasi maksimum periode", () => {
    const plans = planInvoices(lease({ startDate: "2020-01-05" }), rules, "2026-11-10", new Set(), 24);
    expect(plans).toHaveLength(24);
    expect(plans[0].period).toBe("2020-01-01");
  });
});
