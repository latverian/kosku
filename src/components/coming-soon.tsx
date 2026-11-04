import { Hammer } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Halaman yang sudah ada di navigasi tetapi fiturnya dikerjakan di fase berikutnya. */
export function ComingSoon({
  title,
  phase,
  features,
}: {
  title: string;
  phase: 1 | 2 | 3;
  features: string[];
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold lg:text-2xl">{title}</h1>
      <Card className="flex flex-col items-start gap-4 p-6">
        <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Hammer className="size-5" aria-hidden />
        </span>
        <div>
          <p className="font-medium">Sedang dibangun — Fase {phase}</p>
          <p className="text-sm text-muted-foreground">Yang akan tersedia di halaman ini:</p>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Kembali ke dashboard
        </Link>
      </Card>
    </div>
  );
}
