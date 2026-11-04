import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-semibold">404</p>
      <p className="text-muted-foreground">Halaman tidak ditemukan.</p>
      <Link href="/" className={buttonVariants()}>
        Kembali ke dashboard
      </Link>
    </main>
  );
}
