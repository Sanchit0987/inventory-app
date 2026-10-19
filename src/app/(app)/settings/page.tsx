import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import SettingsClient from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const [org, taxRates, users, categories, warehouses] = await Promise.all([
    db.organization.findUnique({ where: { id: 1 } }),
    db.taxRate.findMany({ orderBy: { rate: "desc" } }),
    db.user.findMany({
      orderBy: [{ status: "desc" }, { createdAt: "asc" }], // PENDING first
      select: { id: true, name: true, email: true, role: true, status: true, requestedRole: true, createdAt: true },
    }),
    db.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } }),
    db.warehouse.findMany({ orderBy: { code: "asc" }, include: { _count: { select: { stockLevels: true } } } }),
  ]);

  return (
    <SettingsClient
      me={{ id: session!.id, role: session!.role }}
      org={{
        name: org?.name ?? "",
        businessType: org?.businessType ?? "",
        currency: org?.currency ?? "USD",
        currencySymbol: org?.currencySymbol ?? "$",
        timezone: org?.timezone ?? "UTC",
        address: org?.address ?? "",
        units: org?.units ?? ["pcs", "box", "kg"],
        defaultReorderPoint: org?.defaultReorderPoint ?? 5,
        lowStockEmailAlerts: org?.lowStockEmailAlerts ?? true,
      }}
      taxRates={taxRates}
      users={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name, productCount: c._count.products }))}
      warehouses={warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name, address: w.address, isPrimary: w.isPrimary, levelCount: w._count.stockLevels }))}
    />
  );
}
