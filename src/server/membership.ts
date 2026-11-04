import "server-only";
import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { asUser, schema } from "@/db";
import type { CurrentUser } from "./auth";

export type Membership = { role: "owner" | "manager"; canViewFinance: boolean; isOwner: boolean };

/** Peran user di properti aktif (FR-10.2). */
export const getMembership = cache(async (user: CurrentUser, propertyId: string): Promise<Membership> => {
  const [m] = await asUser(user.id, (tx) =>
    tx
      .select({ role: schema.propertyMembers.role, canViewFinance: schema.propertyMembers.canViewFinance })
      .from(schema.propertyMembers)
      .where(
        and(eq(schema.propertyMembers.propertyId, propertyId), eq(schema.propertyMembers.userId, user.id)),
      ),
  );
  const role = m?.role ?? "manager";
  return { role, isOwner: role === "owner", canViewFinance: role === "owner" || Boolean(m?.canViewFinance) };
});
