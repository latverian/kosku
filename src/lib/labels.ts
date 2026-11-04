/** Label UI berbahasa Indonesia untuk enum database (specs/04 § 2). */
export const ROOM_STATUS_LABEL = {
  vacant: "Kosong",
  occupied: "Terisi",
  reserved: "Dipesan",
  maintenance: "Perbaikan",
} as const;

export const PAYMENT_METHOD_LABEL = {
  cash: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
  va: "Virtual Account",
  ewallet: "E-wallet",
  credit: "Saldo",
  other: "Lainnya",
} as const;

export const PAYMENT_STATUS_LABEL = {
  pending: "Menunggu verifikasi",
  verified: "Terverifikasi",
  rejected: "Ditolak",
} as const;

export const ITEM_TYPE_LABEL = {
  rent: "Sewa",
  electricity: "Listrik",
  water: "Air",
  laundry: "Laundry",
  late_fee: "Denda",
  discount: "Diskon",
  other: "Lainnya",
} as const;

export const DEPOSIT_STATUS_LABEL = {
  held: "Ditahan",
  refunded: "Dikembalikan",
  partial_refund: "Dikembalikan sebagian",
  forfeited: "Hangus",
  transferred: "Dipindah",
} as const;
