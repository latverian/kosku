import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withUser } from "@/db/client";
import type { Actor } from "@/services/core";
import { updateDeliveryStatus } from "@/services/messaging";
import { createProperty } from "@/services/properties";
import { addManager, findUserIdByEmail, listMembers, removeMember, setFinanceAccess } from "@/services/team";
import { connect, createAuthUser, s, uniqueCode } from "./helpers";

const { db, client } = connect();
let owner: Actor & { type: "user" };
let propertyId: string;
let managerEmail: string;
let managerId: string;
const as = <T>(fn: Parameters<typeof withUser<T>>[2]) => withUser(db, owner.id, fn);

beforeAll(async () => {
  owner = { type: "user", id: await createAuthUser(db, `team-${uniqueCode()}@test.local`) };
  propertyId = await as(
    async (tx) => (await createProperty(tx, owner, { code: uniqueCode(), name: "Kos Tim" })).id,
  );
  managerEmail = `Joko-${uniqueCode()}@Test.local`;
  managerId = await createAuthUser(db, managerEmail.toLowerCase());
});

afterAll(async () => {
  await client.end();
});

describe("tim pengelola", () => {
  it("cari user dengan email (tanpa peduli huruf besar), tambah sebagai pengelola", async () => {
    const found = await db.transaction((tx) => findUserIdByEmail(tx, managerEmail));
    expect(found).toBe(managerId);
    await as((tx) => addManager(tx, owner, propertyId, found, false));
    const members = await as((tx) => listMembers(tx, propertyId));
    expect(members.map((m) => m.role).sort()).toEqual(["manager", "owner"]);
    await expect(as((tx) => addManager(tx, owner, propertyId, found, false))).rejects.toThrow(
      /sudah menjadi anggota/,
    );
    await expect(as((tx) => addManager(tx, owner, propertyId, null, false))).rejects.toThrow(
      /belum terdaftar/,
    );
  });

  it("pengelola baru bisa melihat kos; tidak bisa mengubah tim", async () => {
    const visible = await withUser(db, managerId, (tx) =>
      tx.select().from(s.properties).where(eq(s.properties.id, propertyId)),
    );
    expect(visible).toHaveLength(1);
    const stranger = await createAuthUser(db, `x-${uniqueCode()}@test.local`);
    await expect(
      withUser(db, managerId, (tx) =>
        addManager(tx, { type: "user", id: managerId }, propertyId, stranger, true),
      ),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(
      withUser(db, managerId, (tx) =>
        setFinanceAccess(tx, { type: "user", id: managerId }, propertyId, managerId, true),
      ),
    ).rejects.toThrow(/Hanya pemilik/);
  });

  it("izin keuangan & hapus anggota; pemilik tidak bisa menghapus diri sendiri", async () => {
    await as((tx) => setFinanceAccess(tx, owner, propertyId, managerId, true));
    let [m] = (await as((tx) => listMembers(tx, propertyId))).filter((x) => x.userId === managerId);
    expect(m.canViewFinance).toBe(true);
    await expect(as((tx) => removeMember(tx, owner, propertyId, owner.id))).rejects.toThrow(/diri sendiri/);
    await as((tx) => removeMember(tx, owner, propertyId, managerId));
    [m] = (await as((tx) => listMembers(tx, propertyId))).filter((x) => x.userId === managerId);
    expect(m).toBeUndefined();
    const visible = await withUser(db, managerId, (tx) =>
      tx.select().from(s.properties).where(eq(s.properties.id, propertyId)),
    );
    expect(visible).toHaveLength(0);
  });
});

describe("status pengiriman WA", () => {
  it("maju sent → delivered → read, tidak mundur", async () => {
    const [m] = await db
      .insert(s.messages)
      .values({
        propertyId,
        toPhone: "62",
        type: "manual",
        body: "x",
        status: "sent",
        providerMessageId: `fon-${uniqueCode()}`,
      })
      .returning();
    expect(await updateDeliveryStatus(db, m.providerMessageId!, "read")).toBe(true);
    expect(await updateDeliveryStatus(db, m.providerMessageId!, "delivered")).toBe(false);
    expect(await updateDeliveryStatus(db, "tidak-ada", "read")).toBe(false);
    const [after] = await db.select().from(s.messages).where(eq(s.messages.id, m.id));
    expect(after.status).toBe("read");
  });
});
