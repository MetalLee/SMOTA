import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@smota/shared", "@smota/agent-core", "@smota/sandbox-runner"],
  serverExternalPackages: ["playwright", "playwright-core"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        playwright: "commonjs playwright",
        "playwright-core": "commonjs playwright-core"
      });
    }

    return config;
  }
};

export default nextConfig;
