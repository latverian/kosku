import { asc, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { properties, propertySettings, type BankAccount } from "@/db/schema";
import { DEFAULT_TEMPLATES } from "@/lib/messaging/templates";
import { messageTemplates } from "@/db/schema";
import { audit, must, ServiceError, type Actor } from "./core";

export type PropertyInput = {
  code: string;
  name: string;
  address?: string | null;
  contactPhone?: string | null;
  rules?: string | null;
  timezone?: string;
};

export async function createProperty(tx: Tx, actor: Actor, input: PropertyInput) {
  if (actor.type !== "user") throw new ServiceError("Properti hanya bisa dibuat oleh pengguna.");
  const [row] = await tx
    .insert(properties)
    .values({
      code: input.code.toUpperCase(),
      name: input.name,
      address: input.address ?? null,
      contactPhone: input.contactPhone ?? null,
      rules: input.rules ?? null,
      timezone: input.timezone ?? "Asia/Jakarta",
      createdBy: actor.id,
    })
    .returning();

  // Template WA default untuk Fase 2
  await tx.insert(messageTemplates).values(
    Object.entries(DEFAULT_TEMPLATES).map(([type, body]) => ({
      propertyId: row.id,
      type: type as keyof typeof DEFAULT_TEMPLATES,
      body,
    })),
  );

  await audit(tx, actor, {
    propertyId: row.id,
    action: "property.create",
    entityType: "property",
    entityId: row.id,
    after: row,
  });
  return row;
}

export async function updateProperty(
  tx: Tx,
  actor: Actor,
  propertyId: string,
  input: Omit<PropertyInput, "code">,
) {
  const before = must(
    (await tx.select().from(properties).where(eq(properties.id, propertyId)))[0],
    "Properti",
  );
  const [after] = await tx
    .update(properties)
    .set({
      name: input.name,
      address: input.address ?? null,
      contactPhone: input.contactPhone ?? null,
      rules: input.rules ?? null,
      ...(input.timezone ? { timezone: input.timezone } : {}),
    })
    .where(eq(properties.id, propertyId))
    .returning();
  if (!after) throw new ServiceError("Hanya pemilik yang bisa mengubah data kos.");
  await audit(tx, actor, {
    propertyId,
    action: "property.update",
    entityType: "property",
    entityId: propertyId,
    before,
    after,
  });
  return after;
}

export type SettingsInput = {
  invoiceLeadDays: number;
  prorateFirstMonth: boolean;
  lateFeeType: "none" | "fixed" | "daily";
  lateFeeAmount: number;
  lateFeeMax: number | null;
  lateFeeGraceDays: number;
  bankAccounts: BankAccount[];
};

export async function updateSettings(tx: Tx, actor: Actor, propertyId: string, input: SettingsInput) {
  const before = (
    await tx.select().from(propertySettings).where(eq(propertySettings.propertyId, propertyId))
  )[0];
  const [after] = await tx
    .update(propertySettings)
    .set(input)
    .where(eq(propertySettings.propertyId, propertyId))
    .returning();
  if (!after) throw new ServiceError("Hanya pemilik yang bisa mengubah pengaturan.");
  await audit(tx, actor, {
    propertyId,
    action: "settings.update",
    entityType: "property_settings",
    entityId: propertyId,
    before,
    after,
  });
  return after;
}

export async function getSettings(tx: Tx, propertyId: string) {
  return must(
    (await tx.select().from(propertySettings).where(eq(propertySettings.propertyId, propertyId)))[0],
    "Pengaturan properti",
  );
}

export async function getProperty(tx: Tx, propertyId: string) {
  return must((await tx.select().from(properties).where(eq(properties.id, propertyId)))[0], "Properti");
}

export async function listProperties(tx: Tx) {
  return tx.select().from(properties).where(isNull(properties.archivedAt)).orderBy(asc(properties.createdAt));
}
