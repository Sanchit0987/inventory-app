/**
 * Environment validation — fail fast and loudly at boot instead of
 * mysteriously at request time.
 */
const required = ["DATABASE_URL", "AUTH_SECRET"] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Enforce secret strength only on the running production server — not during
// `next build` (which also sets NODE_ENV=production but uses placeholder env).
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (process.env.NODE_ENV === "production" && !isBuildPhase) {
  const secret = process.env.AUTH_SECRET!;
  if (secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters in production (generate with: openssl rand -base64 48)");
  }
  if (secret.includes("dev-only") || secret.includes("placeholder")) {
    throw new Error("AUTH_SECRET is still a placeholder — set a real secret in production");
  }
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  AUTH_SECRET: process.env.AUTH_SECRET!,
  /** Show one-click demo login buttons + allow demo seed accounts (off by default in prod) */
  DEMO_MODE: process.env.DEMO_MODE === "true",
};
