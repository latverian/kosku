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
