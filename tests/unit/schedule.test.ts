import { describe, expect, it } from "vitest";
import { nextAllowedTime, reminderDue } from "@/lib/messaging/schedule";
import { hashPortalToken, looksLikePortalToken, portalToken } from "@/lib/portal-token";

const offsets = [-3, 0, 1, 3, 7];

describe("jadwal pengingat", () => {
  it("memilih jenis pengingat sesuai offset", () => {
    expect(reminderDue("2026-11-10", "2026-11-07", offsets, new Set())).toBe("reminder_before");
    expect(reminderDue("2026-11-10", "2026-11-10", offsets, new Set())).toBe("reminder_due");
    expect(reminderDue("2026-11-10", "2026-11-13", offsets, new Set())).toBe("reminder_overdue_3");
    expect(reminderDue("2026-11-10", "2026-11-09", offsets, new Set())).toBeNull(); // H-1 tidak dijadwalkan
  });

  it("toleran 1 hari bila job terlewat, tapi tidak lebih", () => {
    expect(reminderDue("2026-11-10", "2026-11-08", offsets, new Set())).toBe("reminder_before");
    expect(reminderDue("2026-11-10", "2026-11-12", offsets, new Set())).toBe("reminder_overdue_1");
    expect(reminderDue("2026-11-10", "2026-11-15", offsets, new Set())).toBeNull();
  });

  it("tidak mengirim ulang jenis yang sudah terkirim", () => {
    expect(reminderDue("2026-11-10", "2026-11-10", offsets, new Set(["reminder_due"]))).toBeNull();
  });

  it("mengikuti offset yang diaktifkan pemilik", () => {
    expect(reminderDue("2026-11-10", "2026-11-07", [0, 7], new Set())).toBeNull();
  });
});

describe("jam tenang", () => {
  const tz = "Asia/Jakarta";
  it("di dalam jam kirim → sekarang", () => {
    const now = new Date("2026-11-04T03:00:00Z"); // 10.00 WIB
    expect(nextAllowedTime(now, tz)).toEqual(now);
  });
  it("jam 21.00 → besok 08.00", () => {
    expect(nextAllowedTime(new Date("2026-11-04T14:00:00Z"), tz).toISOString()).toBe(
      "2026-11-05T01:00:00.000Z",
    );
  });
  it("jam 05.00 → hari ini 08.00", () => {
    expect(nextAllowedTime(new Date("2026-11-03T22:00:00Z"), tz).toISOString()).toBe(
      "2026-11-04T01:00:00.000Z",
    );
  });
  it("menerima format HH:MM:SS dari database", () => {
    expect(nextAllowedTime(new Date("2026-11-04T14:00:00Z"), tz, "20:00:00", "08:00:00").toISOString()).toBe(
      "2026-11-05T01:00:00.000Z",
    );
  });
});

describe("token portal", () => {
  const secret = "rahasia-portal-yang-panjang";
  it("deterministik per penghuni & versi, berubah saat dicabut", () => {
    const a = portalToken(secret, "t1", 1);
    expect(portalToken(secret, "t1", 1)).toBe(a);
    expect(portalToken(secret, "t1", 2)).not.toBe(a);
    expect(portalToken(secret, "t2", 1)).not.toBe(a);
    expect(looksLikePortalToken(a)).toBe(true);
    expect(hashPortalToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("menolak secret pendek", () => {
    expect(() => portalToken("pendek", "t1", 1)).toThrow();
  });
});
