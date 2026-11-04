/**
 * Jadwal pengingat & jam tenang (specs/02 FR-5.1–5.4) — murni.
 */
import { TZDate } from "@date-fns/tz";
import { daysBetween, type IsoDate } from "../billing/dates";

export type ReminderType =
  "reminder_before" | "reminder_due" | "reminder_overdue_1" | "reminder_overdue_3" | "reminder_overdue_7";

/** Pilihan offset yang didukung UI. Offset = hari relatif terhadap jatuh tempo. */
export const REMINDER_OPTIONS: { offset: number; type: ReminderType; label: string }[] = [
  { offset: -3, type: "reminder_before", label: "H-3 (3 hari sebelum)" },
  { offset: 0, type: "reminder_due", label: "H (hari jatuh tempo)" },
  { offset: 1, type: "reminder_overdue_1", label: "H+1 (telat 1 hari)" },
  { offset: 3, type: "reminder_overdue_3", label: "H+3 (telat 3 hari)" },
  { offset: 7, type: "reminder_overdue_7", label: "H+7 (telat 7 hari)" },
];

export function reminderTypeForOffset(offset: number): ReminderType | null {
  if (offset < 0) return "reminder_before";
  return REMINDER_OPTIONS.find((o) => o.offset === offset)?.type ?? null;
}

/**
 * Pengingat yang harus dijadwalkan hari ini untuk satu tagihan, atau null.
 * Toleran 1 hari: bila job kemarin tidak berjalan, pengingat kemarin tetap
 * dikirim hari ini (tapi tidak lebih lama dari itu, agar tidak basi).
 */
export function reminderDue(
  dueDate: IsoDate,
  today: IsoDate,
  offsets: readonly number[],
  alreadySent: ReadonlySet<string>,
): ReminderType | null {
  const current = daysBetween(dueDate, today);
  const candidates = offsets.filter((o) => o <= current && current - o <= 1).sort((a, b) => b - a);
  for (const offset of candidates) {
    const type = reminderTypeForOffset(offset);
    if (type && !alreadySent.has(type)) return type;
  }
  return null;
}

/** "HH:MM" atau "HH:MM:SS" → menit sejak tengah malam */
function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Waktu kirim terdekat yang tidak berada di jam tenang (FR-5.4).
 * quietStart 20:00, quietEnd 08:00 → boleh kirim 08:00–19:59 waktu properti.
 */
export function nextAllowedTime(now: Date, timezone: string, quietStart = "20:00", quietEnd = "08:00"): Date {
  const local = new TZDate(now.getTime(), timezone);
  const minutes = local.getHours() * 60 + local.getMinutes();
  const start = minutesOf(quietStart);
  const end = minutesOf(quietEnd);
  const inQuiet = start > end ? minutes >= start || minutes < end : minutes >= start && minutes < end;
  if (!inQuiet) return now;

  const target = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
    Math.floor(end / 60),
    end % 60,
    0,
    timezone,
  );
  // Jam tenang yang melewati tengah malam & sudah lewat jam mulai → besok pagi
  if (start > end && minutes >= start) target.setDate(target.getDate() + 1);
  return new Date(target.getTime());
}
