/**
 * Denda keterlambatan (FR-3.7).
 * - fixed: nominal tetap sekali setelah masa tenggang lewat.
 * - daily: nominal × hari setelah masa tenggang, dibatasi `max` bila diisi.
 */
import { daysBetween, type IsoDate } from "./dates";

export type LateFeeRule =
  | { type: "none" }
  | { type: "fixed"; amount: number; graceDays: number }
  | { type: "daily"; amount: number; graceDays: number; max?: number | null };

export function lateFee(rule: LateFeeRule, dueDate: IsoDate, today: IsoDate): number {
  if (rule.type === "none") return 0;
  const daysLate = daysBetween(dueDate, today);
  const chargeableDays = daysLate - rule.graceDays;
  if (chargeableDays <= 0) return 0;
  if (rule.type === "fixed") return rule.amount;
  const fee = rule.amount * chargeableDays;
  return rule.max != null ? Math.min(fee, rule.max) : fee;
}
