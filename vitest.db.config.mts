import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tes integrasi database: butuh DATABASE_URL ke PostgreSQL yang sudah dimigrasi.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    setupFiles: ["./src/db/load-env.ts"],
  },
});
