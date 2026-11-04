import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // Skema `auth` milik Supabase, jangan disentuh oleh drizzle-kit.
  schemaFilter: ["public"],
  strict: true,
  verbose: true,
});
