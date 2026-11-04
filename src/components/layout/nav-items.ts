import {
  Banknote,
  BedDouble,
  ChartPie,
  House,
  MessageCircle,
  ReceiptText,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; ownerOnly?: boolean };

/** Urutan sesuai sitemap specs/06-ui-design.md § 3 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: House },
  { href: "/kamar", label: "Kamar", icon: BedDouble },
  { href: "/penghuni", label: "Penghuni", icon: Users },
  { href: "/tagihan", label: "Tagihan", icon: ReceiptText },
  { href: "/pembayaran", label: "Pembayaran", icon: Banknote },
  { href: "/komplain", label: "Komplain", icon: Wrench },
  { href: "/pesan", label: "Pesan WA", icon: MessageCircle },
  { href: "/keuangan", label: "Keuangan", icon: ChartPie, ownerOnly: true },
  { href: "/pengaturan", label: "Pengaturan", icon: Settings },
];

/** Bottom navigation di HP: Dashboard · Kamar · Tagihan · Komplain · Lainnya */
export const MOBILE_PRIMARY = ["/", "/kamar", "/tagihan", "/komplain"];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
