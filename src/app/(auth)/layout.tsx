import { House } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2 text-xl font-semibold">
        <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
          <House className="size-5" aria-hidden />
        </span>
        Kosku
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
