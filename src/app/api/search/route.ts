import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ results: [] }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ results: [] });
  const contains = { contains: q, mode: "insensitive" as const };

  const [products, customers, suppliers, sos, pos] = await Promise.all([
    db.product.findMany({
      where: { OR: [{ name: contains }, { sku: contains }, { barcode: contains }] },
      take: 5,
      include: { category: true },
    }),
    db.customer.findMany({ where: { OR: [{ name: contains }, { email: contains }] }, take: 3 }),
    db.supplier.findMany({ where: { OR: [{ name: contains }, { email: contains }] }, take: 3 }),
    db.salesOrder.findMany({ where: { number: contains }, take: 3, include: { customer: true } }),
    db.purchaseOrder.findMany({ where: { number: contains }, take: 3, include: { supplier: true } }),
  ]);

  const results = [
    ...products.map((p) => ({ type: "Product", id: p.id, title: p.name, subtitle: `${p.sku} · ${p.category?.name ?? "Uncategorized"}`, href: `/items/${p.id}` })),
    ...sos.map((o) => ({ type: "Sales order", id: o.id, title: o.number, subtitle: o.customer.name, href: `/sales/${o.id}` })),
    ...pos.map((o) => ({ type: "Purchase order", id: o.id, title: o.number, subtitle: o.supplier.name, href: `/purchases/${o.id}` })),
    ...customers.map((c) => ({ type: "Customer", id: c.id, title: c.name, subtitle: c.email ?? "", href: `/contacts/customer/${c.id}` })),
    ...suppliers.map((s) => ({ type: "Supplier", id: s.id, title: s.name, subtitle: s.email ?? "", href: `/contacts/supplier/${s.id}` })),
  ];
  return NextResponse.json({ results });
}
