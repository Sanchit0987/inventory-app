import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Liveness + readiness probe for load balancers and orchestrators. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up" });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
