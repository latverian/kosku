/**
 * Data contoh untuk development (specs/04-database.md § 5).
 *
 *   SEED_OWNER_EMAIL=kamu@email.com pnpm db:seed
 *
 * - Properti "Kos Melati" (MLT), 12 kamar (3 lantai × 4), 9 terisi.
 * - Tagihan 3 periode terakhir dengan campuran lunas, sebagian, terlambat,
 *   dan menunggu verifikasi — relatif terhadap tanggal hari ini.
 * - 5 komplain dengan status berbeda.
 *
 * Jika SEED_OWNER_EMAIL diisi dan user itu sudah terdaftar (login sekali lewat
 * halaman /login), ia dijadikan owner. Seed menolak berjalan jika properti MLT
 * sudah ada.
 */
import "./load-env";
import { eq, sql } from "drizzle-orm";
import {
  addMonths,
  dueDate,
  firstPeriod,
  invoiceNumber,
  periodOf,
  prorate,
  todayIn,
  addDays,
  daysBetween,
} from "../lib/billing";
import { formatPeriod } from "../lib/format";
import { DEFAULT_TEMPLATES } from "../lib/messaging/templates";
import { createDb } from "./client";
import * as s from "./schema";

const TZ = "Asia/Jakarta";
const PROPERTY_CODE = "MLT";

const ROOM_TYPES = [
  { floor: 1, type: "Standar", price: 1_500_000, facilities: ["Kasur", "Lemari", "WiFi"] },
  { floor: 2, type: "AC", price: 1_800_000, facilities: ["Kasur", "Lemari", "WiFi", "AC"] },
  {
    floor: 3,
    type: "AC + KM dalam",
    price: 2_200_000,
    facilities: ["Kasur", "Lemari", "WiFi", "AC", "KM dalam"],
  },
];

type Scenario = "paid" | "partial" | "overdue" | "pending" | "upcoming";

// kamar → [nama, no. WA, tanggal tagih, bulan sejak masuk, skenario bulan ini]
const OCCUPANTS: Record<string, [string, string, number, number, Scenario]> = {
  "01": ["Andi Pratama", "6281211110001", 1, 14, "paid"],
  "02": ["Rina Wulandari", "6281211110002", 5, 9, "paid"],
  "03": ["Sinta Maharani", "6281211110003", 1, 7, "overdue"],
  "05": ["Rudi Hartono", "6281211110005", 10, 5, "upcoming"],
  "06": ["Fajar Nugroho", "6281211110006", 15, 20, "paid"],
  "07": ["Dewi Lestari", "6281211110007", 10, 4, "pending"],
  "09": ["Putri Ayu", "6281211110009", 2, 3, "overdue"],
  "10": ["Yoga Saputra", "6281211110010", 25, 11, "partial"],
  "11": ["Nadia Rahma", "6281211110011", 5, 2, "pending"],
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diatur");
  const { db, client } = createDb(url);

  try {
    const existing = await db
      .select({ id: s.properties.id })
      .from(s.properties)
      .where(eq(s.properties.code, PROPERTY_CODE));
    if (existing.length > 0) {
      console.log(`Properti ${PROPERTY_CODE} sudah ada — seed dilewati.`);
      return;
    }

    const ownerId = await findOwner(db);
    const today = todayIn(TZ);

    await db.transaction(async (tx) => {
      const [property] = await tx
        .insert(s.properties)
        .values({
          code: PROPERTY_CODE,
          name: "Kos Melati",
          address: "Jl. Melati No. 12, Bandung",
          contactPhone: "6281200000000",
          rules:
            "- Tamu maksimal pukul 21.00\n- Jaga kebersihan dapur bersama\n- Matikan AC saat keluar kamar",
          createdBy: ownerId,
        })
        .returning();

      await tx
        .update(s.propertySettings)
        .set({
          bankAccounts: [{ bank: "BCA", number: "1234567890", holder: "Budi Santoso" }],
          lateFeeType: "daily",
          lateFeeAmount: 5_000,
          lateFeeMax: 100_000,
          lateFeeGraceDays: 3,
        })
        .where(eq(s.propertySettings.propertyId, property.id));

      await tx.insert(s.messageTemplates).values(
        Object.entries(DEFAULT_TEMPLATES).map(([type, body]) => ({
          propertyId: property.id,
          type: type as keyof typeof DEFAULT_TEMPLATES,
          body,
        })),
      );

      // Kamar
      const roomRows = await tx
        .insert(s.rooms)
        .values(
          Array.from({ length: 12 }, (_, i) => {
            const t = ROOM_TYPES[Math.floor(i / 4)];
            return {
              propertyId: property.id,
              code: String(i + 1).padStart(2, "0"),
              floor: t.floor,
              type: t.type,
              monthlyPrice: t.price,
              depositAmount: 500_000,
              facilities: t.facilities,
              status: i === 11 ? ("maintenance" as const) : ("vacant" as const),
              notes: i === 11 ? "Pengecatan ulang" : null,
            };
          }),
        )
        .returning();

      let invoiceCount = 0;
      for (const room of roomRows) {
        const occupant = OCCUPANTS[room.code];
        if (!occupant) continue;
        const [fullName, phone, billingDay, monthsAgo, scenario] = occupant;

        const [tenant] = await tx
          .insert(s.tenants)
          .values({
            propertyId: property.id,
            fullName,
            phone,
            occupation: monthsAgo > 10 ? "Karyawan swasta" : "Mahasiswa",
            emergencyName: "Orang tua",
            emergencyRelation: "Orang tua",
            emergencyPhone: "6281399990000",
          })
          .returning();

        // Tanggal masuk: N bulan lalu pada tanggal tagih (+ 3 hari untuk satu orang agar ada prorata)
        const startPeriod = addMonths(periodOf(today), -monthsAgo);
        const startDate =
          room.code === "11"
            ? addDays(dueDate(startPeriod, billingDay), 3)
            : dueDate(startPeriod, billingDay);

        const [lease] = await tx
          .insert(s.leases)
          .values({
            propertyId: property.id,
            roomId: room.id,
            tenantId: tenant.id,
            startDate,
            monthlyRent: room.monthlyPrice,
            billingDay,
            depositAmount: room.depositAmount,
          })
          .returning();

        // Tagihan: 3 periode terakhir yang jatuh temponya ≤ hari ini + 7 hari
        const periods = [-2, -1, 0, 1]
          .map((offset) => addMonths(periodOf(today), offset))
          .filter((p) => p >= firstPeriod(startDate, billingDay))
          .filter((p) => daysBetween(today, dueDate(p, billingDay)) <= 7)
          .slice(-3);

        for (const [index, period] of periods.entries()) {
          const due = dueDate(period, billingDay);
          const isFirst = period === firstPeriod(startDate, billingDay);
          const isLatest = index === periods.length - 1;
          const amount = isFirst ? prorate(lease.monthlyRent, startDate) : lease.monthlyRent;

          const [invoice] = await tx
            .insert(s.invoices)
            .values({
              propertyId: property.id,
              leaseId: lease.id,
              tenantId: tenant.id,
              roomId: room.id,
              number: invoiceNumber(PROPERTY_CODE, period, room.code),
              period,
              issueDate: addDays(due, -7),
              dueDate: due,
            })
            .returning();
          invoiceCount++;

          await tx.insert(s.invoiceItems).values({
            invoiceId: invoice.id,
            type: "rent",
            description: `Sewa ${formatPeriod(period)}${isFirst ? " (prorata)" : ""}`,
            amount,
          });

          // Periode lama selalu lunas; periode terbaru mengikuti skenario.
          const effective: Scenario = isLatest ? scenario : "paid";
          const pay = (value: number, status: "verified" | "pending", by: "staff" | "tenant") =>
            tx.insert(s.payments).values({
              propertyId: property.id,
              invoiceId: invoice.id,
              tenantId: tenant.id,
              amount: value,
              paidAt: new Date(`${addDays(due, -1)}T03:00:00Z`),
              method: "transfer",
              status,
              submittedBy: by,
              recordedBy: by === "staff" ? ownerId : null,
              verifiedBy: status === "verified" ? ownerId : null,
              verifiedAt: status === "verified" ? new Date() : null,
              proofPath: by === "tenant" ? `seed/${invoice.number}.jpg` : null,
            });

          if (effective === "paid") await pay(amount, "verified", "staff");
          if (effective === "partial") await pay(Math.round(amount / 2 / 1000) * 1000, "verified", "staff");
          if (effective === "pending") await pay(amount, "pending", "tenant");
        }
      }

      // Komplain
      const roomByCode = new Map(roomRows.map((r) => [r.code, r]));
      const complaintSeed = [
        {
          code: "07",
          category: "ac",
          title: "AC tidak dingin",
          priority: "high",
          status: "in_progress",
          assigneeName: "Pak Joko",
        },
        {
          code: "03",
          category: "water",
          title: "Kran kamar mandi bocor",
          priority: "medium",
          status: "open",
        },
        {
          code: null,
          category: "water",
          title: "Air mati lantai 2",
          priority: "urgent",
          status: "open",
          location: "Lantai 2",
        },
        {
          code: "05",
          category: "internet",
          title: "WiFi lambat malam hari",
          priority: "low",
          status: "open",
        },
        {
          code: "02",
          category: "electricity",
          title: "Lampu kamar mandi mati",
          priority: "medium",
          status: "resolved",
          cost: 35_000,
          rating: 5,
        },
      ] as const;

      for (const c of complaintSeed) {
        const room = c.code ? roomByCode.get(c.code) : undefined;
        const [lease] = room
          ? await tx.select().from(s.leases).where(eq(s.leases.roomId, room.id))
          : [undefined];
        await tx.insert(s.complaints).values({
          propertyId: property.id,
          tenantId: lease?.tenantId ?? null,
          roomId: room?.id ?? null,
          location: "location" in c ? c.location : null,
          category: c.category,
          title: c.title,
          priority: c.priority,
          status: c.status,
          assigneeName: "assigneeName" in c ? c.assigneeName : null,
          cost: "cost" in c ? c.cost : null,
          rating: "rating" in c ? c.rating : null,
        });
      }

      console.log(
        `✓ Kos Melati: ${roomRows.length} kamar, ${Object.keys(OCCUPANTS).length} penghuni, ` +
          `${invoiceCount} tagihan, ${complaintSeed.length} komplain` +
          (ownerId ? "" : "\n  ⚠ Tanpa owner: set SEED_OWNER_EMAIL agar data terlihat di dashboard."),
      );
    });
  } finally {
    await client.end();
  }
}

async function findOwner(db: ReturnType<typeof createDb>["db"]): Promise<string | null> {
  const email = process.env.SEED_OWNER_EMAIL;
  if (!email) return null;
  const rows = await db.execute<{ id: string }>(
    sql`select id from auth.users where lower(email) = lower(${email}) limit 1`,
  );
  if (rows.length === 0) {
    console.warn(`⚠ User ${email} belum terdaftar. Login sekali di /login, lalu jalankan seed lagi.`);
    return null;
  }
  return rows[0].id;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
