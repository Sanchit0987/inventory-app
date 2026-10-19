import type { NextConfig } from "next";

const securityHeaders = [
  // clickjacking protection
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // MIME sniffing protection
  { key: "X-Content-Type-Options", value: "nosniff" },
  // referrer hygiene
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // lock down powerful browser APIs this app never uses
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // HSTS (takes effect behind HTTPS)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // DB-driven app: every page reads live data, so component caching is disabled
  // and pages opt into dynamic rendering with `export const dynamic`.
  // Standalone output produces a self-contained server for Docker deployment;
  // Vercel manages its own serverless packaging, so skip it there.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
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
