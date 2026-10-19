import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import OnboardingWizard from "./wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [org, warehouseCount, productCount] = await Promise.all([
    db.organization.findUnique({ where: { id: 1 } }),
    db.warehouse.count(),
    db.product.count(),
  ]);

  return (
    <OnboardingWizard
      userName={session.name}
      org={{
        name: org?.name ?? "",
        businessType: org?.businessType ?? "",
        currency: org?.currency ?? "USD",
        currencySymbol: org?.currencySymbol ?? "$",
        timezone: org?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      }}
      hasWarehouse={warehouseCount > 0}
      hasProducts={productCount > 0}
    />
  );
}
