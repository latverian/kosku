/**
 * Rencana tagihan untuk satu sewa — murni, tanpa I/O.
 *
 * Model siklus: tagihan periode P menutup [jatuhTempo(P), jatuhTempo(P+1)),
 * dibayar di muka pada jatuh temponya. Periode = tanggal 1 bulan jatuh tempo.
 *
 * Tagihan pertama:
 * - Masuk tepat di tanggal tagih → tagihan penuh, jatuh tempo = tanggal masuk.
 * - Masuk di tengah siklus → menutup [masuk, jatuhTempo berikutnya), jatuh tempo
 *   = tanggal masuk. Prorata aktif: nominal sebanding sisa hari siklus. Prorata
 *   nonaktif: ditagih penuh.
 *
 * Contoh (specs/02 AC FR-2.2): tagih tgl 1, masuk 20 Nov, Rp1.500.000 →
 * siklus 1 Nov–1 Des (30 hari), sisa 11 hari → Rp550.000.
 */
import { addMonths, daysBetween, dueDate, periodOf, type IsoDate } from "./dates";

export type LeaseTerms = {
  startDate: IsoDate;
  endDate: IsoDate | null;
  billingDay: number;
  monthlyRent: number;
  /** Untuk penghuni lama yang baru dimasukkan: periode sebelum ini tidak ditagih. */
  billingStartPeriod: IsoDate | null;
};

export type BillingRules = {
  invoiceLeadDays: number;
  prorateFirstMonth: boolean;
};

export type InvoicePlan = {
  period: IsoDate;
  dueDate: IsoDate;
  /** awal siklus yang ditagih (inklusif) */
  coversFrom: IsoDate;
  /** akhir siklus (eksklusif) */
  coversTo: IsoDate;
  rent: number;
  prorated: boolean;
};

/** Periode siklus yang memuat `date`: jatuhTempo(P) ≤ date < jatuhTempo(P+1). */
export function cycleContaining(date: IsoDate, billingDay: number): IsoDate {
  const period = periodOf(date);
  return dueDate(period, billingDay) <= date ? period : addMonths(period, -1);
}

/** Nominal prorata, dibulatkan ke atas ke ribuan. */
export function prorateCycle(
  monthlyRent: number,
  from: IsoDate,
  cycleStart: IsoDate,
  cycleEnd: IsoDate,
): number {
  const total = daysBetween(cycleStart, cycleEnd);
  const used = daysBetween(from, cycleEnd);
  if (used >= total) return monthlyRent;
  return Math.ceil((monthlyRent * used) / total / 1000) * 1000;
}

/**
 * Tagihan yang seharusnya sudah ada per `today`: semua siklus yang jatuh
 * temponya ≤ today + invoiceLeadDays, belum ada di `existingPeriods`,
 * tidak sebelum `billingStartPeriod`, dan jatuh tempo sebelum tanggal keluar.
 * Urut dari periode terlama. Dibatasi `maxPeriods` agar data lama yang
 * tertinggal tidak membuat ratusan tagihan sekaligus.
 */
export function planInvoices(
  lease: LeaseTerms,
  rules: BillingRules,
  today: IsoDate,
  existingPeriods: ReadonlySet<IsoDate> = new Set(),
  maxPeriods = 24,
): InvoicePlan[] {
  const plans: InvoicePlan[] = [];
  const firstPeriod = cycleContaining(lease.startDate, lease.billingDay);
  const isDue = (due: IsoDate) => daysBetween(today, due) <= rules.invoiceLeadDays;
  const beforeEnd = (due: IsoDate) => lease.endDate == null || due < lease.endDate;
  const allowed = (period: IsoDate) => lease.billingStartPeriod == null || period >= lease.billingStartPeriod;

  // Tagihan pertama (bisa prorata)
  {
    const cycleStart = dueDate(firstPeriod, lease.billingDay);
    const cycleEnd = dueDate(addMonths(firstPeriod, 1), lease.billingDay);
    const midCycle = cycleStart !== lease.startDate;
    const prorated = midCycle && rules.prorateFirstMonth;
    const due = lease.startDate;
    if (isDue(due) && beforeEnd(due) && allowed(firstPeriod) && !existingPeriods.has(firstPeriod)) {
      plans.push({
        period: firstPeriod,
        dueDate: due,
        coversFrom: lease.startDate,
        coversTo: cycleEnd,
        rent: prorated
          ? prorateCycle(lease.monthlyRent, lease.startDate, cycleStart, cycleEnd)
          : lease.monthlyRent,
        prorated,
      });
    }
  }

  for (let i = 1; plans.length < maxPeriods; i++) {
    const period = addMonths(firstPeriod, i);
    const due = dueDate(period, lease.billingDay);
    if (!isDue(due) || !beforeEnd(due)) break;
    if (!allowed(period) || existingPeriods.has(period)) continue;
    plans.push({
      period,
      dueDate: due,
      coversFrom: due,
      coversTo: dueDate(addMonths(period, 1), lease.billingDay),
      rent: lease.monthlyRent,
      prorated: false,
    });
  }

  return plans;
}
