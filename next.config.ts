import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ws uses buffer-util.mask; bundling breaks it on Vercel ("b.mask is not a function").
  serverExternalPackages: ["ws", "bufferutil", "@tickstream/client"],
};

export default nextConfig;
