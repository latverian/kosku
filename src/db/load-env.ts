/**
 * Muat variabel environment untuk skrip di luar Next.js (drizzle-kit, seed, tes DB).
 * Urutan sama seperti Next.js: .env.local lebih diutamakan daripada .env.
 * Variabel yang sudah ada di shell tidak ditimpa.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
