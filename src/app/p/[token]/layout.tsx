import { House } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portal penghuni",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PortalLayout({ children }: LayoutProps<"/p/[token]">) {
  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <House className="size-4" aria-hidden />
          </span>
          Kosku
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 py-5 pb-16">{children}</main>
    </div>
  );
}
