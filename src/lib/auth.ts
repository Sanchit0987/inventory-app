import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "./db";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
const COOKIE = "inv_session";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "STAFF";
};

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(secret);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as SessionUser["role"],
    };
  } catch {
    return null;
  }
});

export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHORIZED");
  return s;
}

/** Role gate: ADMIN > MANAGER > STAFF */
const rank = { ADMIN: 3, MANAGER: 2, STAFF: 1 } as const;
export async function requireRole(min: keyof typeof rank): Promise<SessionUser> {
  const s = await requireSession();
  if (rank[s.role] < rank[min]) throw new Error("FORBIDDEN");
  return s;
}

export async function logActivity(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string,
  detail?: string
) {
  await db.activityLog.create({
    data: { userId, action, entity, entityId, detail },
  });
}
