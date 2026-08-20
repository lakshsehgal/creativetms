import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Only pull in the icons actually used — keeps the client bundle small.
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
  typedRoutes: false,
};

export default nextConfig;
