import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@smota/shared", "@smota/agent-core", "@smota/sandbox-runner"]
};

export default nextConfig;
