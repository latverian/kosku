import "server-only";
import { cache } from "react";
import { adminDb } from "@/db";
import { resolvePortal } from "@/services/portal";

/** Validasi token portal (sekali per request). Null bila tidak berlaku. */
export const getPortal = cache(async (token: string) =>
  adminDb().transaction((tx) => resolvePortal(tx, token)),
);
