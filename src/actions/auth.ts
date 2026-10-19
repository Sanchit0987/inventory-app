"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, logActivity } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export type AuthState = { error?: string; info?: string } | undefined;

// dummy hash compared on unknown emails so response timing doesn't leak account existence
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8ZF2VdLx0mN3oPqRsTuVwXyZ1234567";

async function clientKey(scope: string) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return `${scope}:${ip}`;
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  // 10 attempts / minute per IP
  const rl = rateLimit(await clientKey("login"), 10, 60_000);
  if (!rl.ok) return { error: `Too many attempts — try again in ${rl.retryAfterSec}s.` };

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const passwordOk = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    return { error: "Invalid email or password" };
  }
  if (user.status === "PENDING") {
    return { error: "Your admin-access request is awaiting approval by an existing admin." };
  }
  await createSession({ id: user.id, email: user.email, name: user.name, role: user.role });
  await logActivity(user.id, "signed in", "User", user.id);
  redirect("/dashboard");
}

const signupSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  requestedRole: z.enum(["STAFF", "ADMIN"]),
});

/**
 * Self-signup. STAFF accounts are active immediately and signed in.
 * ADMIN requests create a PENDING account (cannot sign in yet) and notify
 * every existing admin via an admin-only notification; an admin then
 * approves or rejects it in Settings → Users & roles.
 */
export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  // 5 signups / 10 minutes per IP
  const rl = rateLimit(await clientKey("signup"), 5, 600_000);
  if (!rl.ok) return { error: `Too many signup attempts — try again in ${rl.retryAfterSec}s.` };

  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const email = d.email.toLowerCase();

  const dup = await db.user.findUnique({ where: { email } });
  if (dup) return { error: "An account with that email already exists" };

  const passwordHash = await bcrypt.hash(d.password, 10);

  // bootstrap: the very first account on a fresh install becomes an active admin
  // (otherwise an empty production database could never gain an administrator)
  const userCount = await db.user.count();
  if (userCount === 0) {
    const user = await db.user.create({
      data: { name: d.name, email, passwordHash, role: "ADMIN", status: "ACTIVE", onboarded: false },
    });
    await logActivity(user.id, "signed up as first admin", "User", user.id, email);
    await createSession({ id: user.id, email: user.email, name: user.name, role: user.role });
    redirect("/onboarding");
  }

  if (d.requestedRole === "ADMIN") {
    const user = await db.user.create({
      data: {
        name: d.name,
        email,
        passwordHash,
        role: "STAFF", // placeholder until approved; never effective while PENDING
        status: "PENDING",
        requestedRole: "ADMIN",
      },
    });
    await db.notification.create({
      data: {
        type: "ADMIN_APPROVAL",
        title: "Admin access requested",
        message: `${d.name} (${email}) signed up requesting admin access — approve or reject in Settings.`,
        link: "/settings?tab=users",
        adminOnly: true,
      },
    });
    await logActivity(user.id, "requested admin access", "User", user.id, email);
    return { info: "Request submitted. An existing admin must approve your account before you can sign in." };
  }

  const user = await db.user.create({
    data: { name: d.name, email, passwordHash, role: "STAFF", status: "ACTIVE", onboarded: false },
  });
  await logActivity(user.id, "signed up", "User", user.id, email);
  await createSession({ id: user.id, email: user.email, name: user.name, role: user.role });
  redirect("/onboarding");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
