import { env } from "@/lib/env";
import LoginClient from "./login-client";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  // demo login buttons only render when DEMO_MODE=true (never by default in prod)
  return <LoginClient demoMode={env.DEMO_MODE} />;
}
