"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <p className="text-lg font-semibold">Terjadi kesalahan</p>
      <p className="text-sm text-muted-foreground">
        Data gagal dimuat. Periksa koneksi internet lalu coba lagi.
      </p>
      <Button onClick={reset}>Coba lagi</Button>
    </div>
  );
}
