import { redirect } from "next/navigation";
import AppShell from "@/components/shell/AppShell";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [org, me, notifications, warehouses] = await Promise.all([
    db.organization.findUnique({ where: { id: 1 } }),
    db.user.findUnique({ where: { id: session.id }, select: { onboarded: true } }),
    db.notification.findMany({
      // admin-only notifications (e.g. admin-access requests) are visible to admins only
      where: session.role === "ADMIN" ? {} : { adminOnly: false },
      orderBy: [{ read: "asc" }, { createdAt: "desc" }],
      take: 20,
    }),
    db.warehouse.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);

  // first-run onboarding wizard: org not set up, or this user signed up and hasn't finished setup
  if (!org?.onboarded && session.role === "ADMIN") redirect("/onboarding");
  if (me && !me.onboarded) redirect("/onboarding");

  return (
    <AppShell
      orgName={org?.name ?? "Inventory"}
      user={{ name: session.name, role: session.role }}
      notifications={notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
      warehouses={warehouses}
    >
      {children}
    </AppShell>
  );
}
