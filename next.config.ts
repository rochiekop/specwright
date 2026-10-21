import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Local single-user app over SQLite: every page renders per request (see `dynamic` in the root layout),
  // so the prerendering model of Cache Components buys nothing here.
  cacheComponents: false,
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
