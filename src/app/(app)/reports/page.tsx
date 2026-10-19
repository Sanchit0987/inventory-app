import { subDays } from "date-fns";
import { db } from "@/lib/db";
import ReportsClient from "./reports-client";

export const dynamic = "force-dynamic";

const RANGES: Record<string, number> = { "30d": 30, "90d": 90, "180d": 180 };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; wh?: string }>;
}) {
  const sp = await searchParams;
  const rangeKey = sp.range && RANGES[sp.range] ? sp.range : "90d";
  const days = RANGES[rangeKey];
  const since = subDays(new Date(), days);
  const whFilter = sp.wh || undefined;

  const [products, soLines, poLines, movements, org, categories, warehouses] = await Promise.all([
    db.product.findMany({ include: { stockLevels: true, category: true } }),
    db.salesOrderLine.findMany({
      where: {
        so: {
          isReturn: false, status: { not: "CANCELLED" }, orderDate: { gte: since },
          ...(whFilter ? { warehouseId: whFilter } : {}),
        },
      },
      include: { so: true },
    }),
    db.purchaseOrderLine.findMany({
      where: {
        po: {
          isReturn: false, status: { not: "CANCELLED" }, orderDate: { gte: since },
          ...(whFilter ? { warehouseId: whFilter } : {}),
        },
      },
      include: { po: true },
    }),
    db.stockMovement.findMany({
      where: { createdAt: { gte: since }, ...(whFilter ? { warehouseId: whFilter } : {}) },
    }),
    db.organization.findUnique({ where: { id: 1 } }),
    db.category.findMany(),
    db.warehouse.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);

  const levelQty = (p: (typeof products)[number]) =>
    p.stockLevels.filter((l) => !whFilter || l.warehouseId === whFilter).reduce((q, l) => q + l.quantity, 0);

  // inventory valuation by category
  const valuationByCat = categories.map((c) => {
    const catProducts = products.filter((p) => p.categoryId === c.id);
    const value = catProducts.reduce((s, p) => s + p.costPrice * levelQty(p), 0);
    const units = catProducts.reduce((s, p) => s + levelQty(p), 0);
    return { category: c.name, value: Math.round(value * 100) / 100, units };
  }).filter((v) => v.units > 0).sort((a, b) => b.value - a.value);

  // weekly sales vs purchases
  const weekCount = Math.min(12, Math.floor(days / 7));
  const weeks: { label: string; sales: number; purchases: number }[] = [];
  for (let w = weekCount - 1; w >= 0; w--) {
    const from = subDays(new Date(), (w + 1) * 7);
    const to = subDays(new Date(), w * 7);
    const sales = soLines.filter((l) => l.so.orderDate >= from && l.so.orderDate < to)
      .reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const purchases = poLines.filter((l) => l.po.orderDate >= from && l.po.orderDate < to)
      .reduce((s, l) => s + l.quantity * l.unitCost, 0);
    weeks.push({ label: w === 0 ? "now" : `-${w}w`, sales: Math.round(sales), purchases: Math.round(purchases) });
  }

  // fast / slow movers
  const soldByProduct = new Map<string, number>();
  for (const l of soLines) soldByProduct.set(l.productId, (soldByProduct.get(l.productId) ?? 0) + l.quantity);
  const movers = products.map((p) => ({
    id: p.id, name: p.name, sku: p.sku, emoji: p.imageEmoji,
    sold: soldByProduct.get(p.id) ?? 0,
    stock: levelQty(p),
    revenue: (soldByProduct.get(p.id) ?? 0) * p.sellingPrice,
  }));
  const fastMovers = [...movers].sort((a, b) => b.sold - a.sold).slice(0, 8);
  const slowMovers = [...movers].filter((m) => m.stock > 0).sort((a, b) => a.sold - b.sold).slice(0, 8);

  // low stock report
  const lowStockReport = products
    .map((p) => ({ id: p.id, name: p.name, sku: p.sku, emoji: p.imageEmoji, stock: levelQty(p), reorderPoint: p.reorderPoint }))
    .filter((p) => p.stock <= p.reorderPoint)
    .sort((a, b) => a.stock - b.stock);

  // movement breakdown
  const movementTypes = ["PURCHASE_RECEIPT", "SALE_SHIPMENT", "ADJUSTMENT", "TRANSFER_IN", "TRANSFER_OUT", "SALES_RETURN", "SUPPLIER_RETURN"];
  const movementBreakdown = movementTypes.map((t) => ({
    type: t.replace(/_/g, " ").toLowerCase(),
    count: movements.filter((m) => m.type === t).length,
    units: movements.filter((m) => m.type === t).reduce((s, m) => s + Math.abs(m.quantity), 0),
  })).filter((m) => m.count > 0);

  const totals = {
    inventoryValue: products.reduce((s, p) => s + p.costPrice * levelQty(p), 0),
    retailValue: products.reduce((s, p) => s + p.sellingPrice * levelQty(p), 0),
    sales: soLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    purchases: poLines.reduce((s, l) => s + l.quantity * l.unitCost, 0),
  };

  // full valuation rows for CSV export
  const valuationRows = products
    .filter((p) => levelQty(p) > 0)
    .map((p) => ({
      name: p.name, sku: p.sku, category: p.category?.name ?? "",
      qty: levelQty(p), costPrice: p.costPrice,
      value: Math.round(levelQty(p) * p.costPrice * 100) / 100,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <ReportsClient
      rangeKey={rangeKey}
      whFilter={whFilter ?? ""}
      warehouses={warehouses}
      valuationByCat={valuationByCat}
      valuationRows={valuationRows}
      weeks={weeks}
      fastMovers={fastMovers}
      slowMovers={slowMovers}
      lowStockReport={lowStockReport}
      movementBreakdown={movementBreakdown}
      totals={totals}
      currencySymbol={org?.currencySymbol ?? "$"}
    />
  );
}
