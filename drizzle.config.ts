import "./src/db/load-env";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL kosong. Isi DATABASE_URL di file .env.local (lihat .env.example & README bagian Setup).",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
  // Skema `auth` milik Supabase, jangan disentuh oleh drizzle-kit.
  schemaFilter: ["public"],
  strict: true,
  verbose: true,
});
