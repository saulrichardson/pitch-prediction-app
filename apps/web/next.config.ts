import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.mlbstatic.com",
        pathname: "/mlb-photos/image/upload/**",
      },
    ],
  },
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@pitch/domain", "@pitch/db", "@pitch/workflows"],
};

export default nextConfig;
