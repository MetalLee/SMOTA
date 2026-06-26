import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@smota/shared", "@smota/agent-core"]
};

export default nextConfig;
