import type { NextConfig } from "next";

/**
 * The Vercel Supabase integration provisions its own environment variables,
 * and it doesn't always use the `NEXT_PUBLIC_` prefix. Browser code can only
 * read prefixed variables, so we bridge whichever names exist into the two the
 * app actually reads. Set them yourself and those win.
 */
/**
 * First value that is actually set. `??` isn't enough: importing a repo can
 * leave a variable defined but blank, and a blank string would win over the
 * real value sitting under a different name.
 */
const firstSet = (...values: (string | undefined)[]) =>
  values.find((value) => value && value.trim().length > 0) ?? "";

const supabaseUrl = firstSet(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_URL,
);

const supabaseAnonKey = firstSet(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  process.env.SUPABASE_ANON_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  process.env.SUPABASE_PUBLISHABLE_KEY,
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
  },
  experimental: {
    // Only pull in the icons actually used — keeps the client bundle small.
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
  typedRoutes: false,
};

export default nextConfig;
