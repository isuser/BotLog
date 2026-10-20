import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone for the Docker image; Vercel ignores it.
  output: "standalone",
  cacheComponents: true,
  // Invite and reset links carry a one-time token in the URL; never pass it on as a referrer.
  async headers() {
    return [{ source: "/auth/confirm", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
