"use client";

import { ChevronsUpDown } from "lucide-react";
import { switchPropertyAction } from "@/app/(dashboard)/property-actions";

export function PropertySwitcher({
  properties,
  activeId,
}: {
  properties: { id: string; name: string }[];
  activeId: string | null;
}) {
  const active = properties.find((p) => p.id === activeId);
  return (
    <form action={switchPropertyAction} className="relative min-w-0">
      <label className="relative flex min-w-0 items-center gap-1 font-semibold">
        <span className="sr-only">Pilih kos</span>
        <span className="truncate">{active?.name ?? "Kosku"}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <select
          name="propertyId"
          defaultValue={activeId ?? ""}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Pilih kos"
        >
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="__new">+ Tambah kos baru</option>
        </select>
      </label>
    </form>
  );
}
