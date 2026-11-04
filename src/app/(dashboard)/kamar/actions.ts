"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asUser } from "@/db";
import { intInRange, money, optionalMoney, optionalText, requiredText } from "@/lib/validation";
import { attempt, formValues, parseForm, requireContext } from "@/server/actions";
import type { FormState } from "@/server/form-state";
import { archiveRoom, createRooms, ROOM_UNIQUE_MESSAGES, sequenceCodes, updateRoom } from "@/services/rooms";

const optionalFloor = z
  .preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(-5).max(200).optional())
  .transform((v) => v ?? null);
const facilities = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean)
      .slice(0, 20),
  );

const roomFields = {
  floor: optionalFloor,
  type: optionalText,
  capacity: intInRange("Kapasitas", 1, 10),
  monthlyPrice: money("Harga per bulan"),
  depositAmount: optionalMoney,
  facilities,
  notes: optionalText,
};

const singleSchema = z.object({ code: requiredText("Kode kamar", 20), ...roomFields });
const bulkSchema = z.object({
  prefix: z
    .string()
    .trim()
    .max(10)
    .optional()
    .transform((v) => v ?? ""),
  start: intInRange("Nomor awal", 0, 9999),
  count: intInRange("Jumlah kamar", 1, 100),
  width: intInRange("Jumlah digit", 1, 4),
  ...roomFields,
});

export async function createRoomsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, property, actor } = await requireContext();
  const mode = formData.get("mode") === "bulk" ? "bulk" : "single";
  const values = formValues(formData);

  let inputs;
  if (mode === "single") {
    const parsed = parseForm(singleSchema, formData);
    if (!parsed.ok) return parsed.state;
    const data = parsed.data;
    inputs = [data];
  } else {
    const parsed = parseForm(bulkSchema, formData);
    if (!parsed.ok) return parsed.state;
    const data = parsed.data;
    const { prefix, start, count, width, ...rest } = data;
    inputs = sequenceCodes(prefix, start, count, width).map((code) => ({ code, ...rest }));
  }

  const result = await attempt(
    async () => {
      await asUser(user.id, (tx) => createRooms(tx, actor, property.id, inputs));
    },
    { values, uniqueMessages: ROOM_UNIQUE_MESSAGES },
  );
  if (result?.error) return result;
  revalidatePath("/kamar");
  revalidatePath("/");
  redirect(`/kamar?ditambah=${inputs.length}`);
}

export async function updateRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, actor } = await requireContext();
  const roomId = String(formData.get("roomId"));
  const parsed = parseForm(
    singleSchema.extend({ status: z.enum(["vacant", "reserved", "maintenance", "occupied"]).optional() }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;
  const { status, ...rest } = data;
  return attempt(
    async () => {
      await asUser(user.id, (tx) =>
        updateRoom(tx, actor, roomId, { ...rest, status: status === "occupied" ? undefined : status }),
      );
      revalidatePath(`/kamar/${roomId}`);
      revalidatePath("/kamar");
      revalidatePath("/");
      return { ok: true, message: "Kamar disimpan." };
    },
    { values: formValues(formData), uniqueMessages: ROOM_UNIQUE_MESSAGES },
  );
}

export async function archiveRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, actor } = await requireContext();
  const roomId = String(formData.get("roomId"));
  const result = await attempt(async () => {
    await asUser(user.id, (tx) => archiveRoom(tx, actor, roomId));
  });
  if (result?.error) return result;
  revalidatePath("/kamar");
  revalidatePath("/");
  redirect("/kamar");
}
