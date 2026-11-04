import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: {
      // foto bukti bayar / komplain dikompres di browser, tapi beri ruang
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
