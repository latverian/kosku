import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, missingVariables, renderTemplate } from "@/lib/messaging/templates";

describe("template WA", () => {
  it("mengganti variabel yang dikenal", () => {
    const out = renderTemplate("Halo {nama}, kamar {kamar}: {nominal}", {
      nama: "Dewi",
      kamar: "07",
      nominal: "Rp1.500.000",
    });
    expect(out).toBe("Halo Dewi, kamar 07: Rp1.500.000");
  });

  it("membiarkan variabel yang tidak dikenal agar terlihat saat pratinjau", () => {
    expect(renderTemplate("Halo {nama} {salah}", { nama: "Dewi" })).toBe("Halo Dewi {salah}");
    expect(missingVariables("Halo {nama} {salah}", { nama: "Dewi" })).toEqual(["salah"]);
  });

  it("template default H-3 memuat rekening dan link portal", () => {
    expect(DEFAULT_TEMPLATES.reminder_before).toContain("{rekening}");
    expect(DEFAULT_TEMPLATES.reminder_before).toContain("{link_portal}");
  });
});

import { invoiceVars, SAMPLE_VARS } from "@/lib/messaging/vars";
import { DEFAULT_TEMPLATES as T } from "@/lib/messaging/templates";

describe("variabel tagihan", () => {
  it("menyusun variabel lengkap untuk semua template default", () => {
    const vars = invoiceVars({
      tenantName: "Dewi",
      roomCode: "07",
      propertyName: "Kos Melati",
      period: "2026-11-01",
      dueDate: "2026-11-10",
      total: 1_850_000,
      paidAmount: 0,
      lateFee: 50_000,
      billingDay: 10,
      bankAccounts: [{ bank: "BCA", number: "123", holder: "Budi" }],
      portalUrl: "https://x/p/abc",
      today: "2026-11-13",
    });
    expect(vars).toMatchObject({
      hari_telat: 3,
      sisa: "Rp1.850.000",
      denda_info: " (termasuk denda Rp50.000)",
    });
    const invoiceTemplates = [
      "reminder_before",
      "reminder_due",
      "reminder_overdue_1",
      "reminder_overdue_3",
      "reminder_overdue_7",
      "payment_confirmed",
      "payment_rejected",
      "welcome",
    ] as const;
    for (const type of invoiceTemplates) {
      expect(missingVariables(T[type], { ...vars, alasan: "x" })).toEqual([]);
    }
  });

  it("contoh pratinjau mencakup semua variabel template default", () => {
    for (const body of Object.values(T)) expect(missingVariables(body, SAMPLE_VARS)).toEqual([]);
  });
});
