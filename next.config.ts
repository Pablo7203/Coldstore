import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep production and review builds isolated from any running local dev server.
  distDir: process.env.NEXT_BUILD_OUTPUT_DIR || ".next",
  experimental: { agentUpgrade: "security" },
  async headers() {
    return [
      {
        source: "/service-worker.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
