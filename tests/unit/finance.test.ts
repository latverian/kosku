import { describe, expect, it } from "vitest";
import { agingBucket, lastPeriods, monthRange, percent, periodFromMonthParam } from "@/lib/finance";

describe("keuangan", () => {
  it("umur tunggakan", () => {
    expect(agingBucket("2026-11-10", "2026-11-10")).toBe("current");
    expect(agingBucket("2026-11-10", "2026-11-17")).toBe("d1_7");
    expect(agingBucket("2026-11-10", "2026-11-18")).toBe("d8_30");
    expect(agingBucket("2026-11-10", "2026-12-11")).toBe("d30plus");
  });
  it("periode 12 bulan terakhir melewati tahun", () => {
    const p = lastPeriods("2026-02-01", 4);
    expect(p).toEqual(["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
  });
  it("rentang & parameter bulan", () => {
    expect(monthRange("2026-12-01")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
    expect(periodFromMonthParam("2026-11")).toBe("2026-11-01");
    expect(periodFromMonthParam("2026-13")).toBeNull();
    expect(periodFromMonthParam(["x"])).toBeNull();
    expect(percent(1, 3)).toBe(33);
    expect(percent(1, 0)).toBe(0);
  });
});
