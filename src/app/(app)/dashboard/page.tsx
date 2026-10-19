import { subDays } from "date-fns";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, DollarSign,
  Package, PackageX, ShoppingCart, Sparkles, Truck,
} from "lucide-react";
import Link from "next/link";
import { Badge, Card, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney, timeAgo } from "@/lib/format";
import DashboardCharts from "./charts";
import DateFilter from "./date-filter";
import QuickActions from "./quick-actions";

export const dynamic = "force-dynamic";

const RANGES: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; wh?: string }>;
}) {
  const sp = await searchParams;
  const rangeKey = sp.range && RANGES[sp.range] ? sp.range : "30d";
  const days = RANGES[rangeKey];
  const since = subDays(new Date(), days);
  const prevSince = subDays(new Date(), days * 2);
  const whFilter = sp.wh || undefined;

  const [org, products, salesNow, salesPrev, purchasesNow, pendingSOs, pendingPOs, activities, movements] =
    await Promise.all([
      db.organization.findUnique({ where: { id: 1 } }),
      db.product.findMany({ where: { isActive: true }, include: { stockLevels: true } }),
      db.salesOrder.findMany({
        where: { isReturn: false, status: { not: "CANCELLED" }, orderDate: { gte: since }, ...(whFilter ? { warehouseId: whFilter } : {}) },
        include: { lines: true },
      }),
      db.salesOrder.findMany({
        where: { isReturn: false, status: { not: "CANCELLED" }, orderDate: { gte: prevSince, lt: since }, ...(whFilter ? { warehouseId: whFilter } : {}) },
        include: { lines: true },
      }),
      db.purchaseOrder.findMany({
        where: { isReturn: false, status: { not: "CANCELLED" }, orderDate: { gte: since }, ...(whFilter ? { warehouseId: whFilter } : {}) },
        include: { lines: true },
      }),
      db.salesOrder.findMany({
        where: { isReturn: false, status: { in: ["CONFIRMED", "PACKED"] } },
        include: { customer: true, lines: true },
        orderBy: { orderDate: "asc" },
        take: 6,
      }),
      db.purchaseOrder.findMany({
        where: { isReturn: false, status: { in: ["ORDERED", "PARTIAL"] } },
        include: { supplier: true, lines: true },
        orderBy: { orderDate: "asc" },
        take: 6,
      }),
      db.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: true } }),
      db.stockMovement.findMany({ where: { createdAt: { gte: since }, ...(whFilter ? { warehouseId: whFilter } : {}) } }),
    ]);

  const sym = org?.currencySymbol ?? "$";
  const isEmpty = products.length === 0;

  const stocked = products.map((p) => ({
    ...p,
    total: p.stockLevels
      .filter((l) => !whFilter || l.warehouseId === whFilter)
      .reduce((q, l) => q + l.quantity, 0),
  }));
  const totalValue = stocked.reduce((s, p) => s + p.costPrice * p.total, 0);
  const totalItems = products.length;
  const lowStock = stocked.filter((p) => p.total > 0 && p.total <= p.reorderPoint);
  const outOfStock = stocked.filter((p) => p.total === 0);

  const orderTotal = (o: { lines: { quantity: number; unitPrice?: number; unitCost?: number }[] }) =>
    o.lines.reduce((s, l) => s + l.quantity * (("unitPrice" in l ? l.unitPrice : l.unitCost) ?? 0), 0);
  const salesTotal = salesNow.reduce((s, o) => s + orderTotal(o), 0);
  const salesPrevTotal = salesPrev.reduce((s, o) => s + orderTotal(o), 0);
  const salesDelta = salesPrevTotal > 0 ? ((salesTotal - salesPrevTotal) / salesPrevTotal) * 100 : 0;
  const purchaseTotal = purchasesNow.reduce((s, o) => s + o.lines.reduce((x, l) => x + l.quantity * l.unitCost, 0), 0);

  // daily sales series for the range
  const salesByDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) salesByDay.set(subDays(new Date(), i).toISOString().slice(0, 10), 0);
  for (const o of salesNow) {
    const k = o.orderDate.toISOString().slice(0, 10);
    if (salesByDay.has(k)) salesByDay.set(k, (salesByDay.get(k) ?? 0) + orderTotal(o));
  }
  const salesSeries = [...salesByDay.entries()].map(([date, revenue]) => ({
    date: date.slice(5), revenue: Math.round(revenue * 100) / 100,
  }));

  const weeks = Math.max(2, Math.min(8, Math.floor(days / 7)));
  const inOut = Array.from({ length: weeks }, (_, w) => {
    const from = subDays(new Date(), (w + 1) * 7);
    const to = subDays(new Date(), w * 7);
    const inQty = movements.filter((m) => m.createdAt >= from && m.createdAt < to && m.quantity > 0).reduce((s, m) => s + m.quantity, 0);
    const outQty = movements.filter((m) => m.createdAt >= from && m.createdAt < to && m.quantity < 0).reduce((s, m) => s - m.quantity, 0);
    return { week: w === 0 ? "This wk" : `${w} wk ago`, in: inQty, out: outQty };
  }).reverse();

  const kpis = [
    { label: "Total items", value: totalItems.toLocaleString(), sub: `${stocked.reduce((s, p) => s + p.total, 0).toLocaleString()} units on hand`, icon: Package, tone: "text-brand-600 bg-brand-50" },
    { label: "Inventory value", value: fmtMoney(totalValue, sym), sub: "at cost price", icon: Boxes, tone: "text-violet-600 bg-violet-50" },
    { label: "Low-stock items", value: String(lowStock.length + outOfStock.length), sub: `${outOfStock.length} out of stock`, icon: AlertTriangle, tone: "text-amber-600 bg-amber-50" },
    { label: "Open orders", value: String(pendingSOs.length + pendingPOs.length), sub: `${pendingSOs.length} sales · ${pendingPOs.length} purchase`, icon: ShoppingCart, tone: "text-emerald-600 bg-emerald-50" },
  ];

  /* First-run empty state: guide instead of blank charts */
  if (isEmpty) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <p className="text-sm text-gray-500">Welcome to {org?.name ?? "your workspace"}</p>
          </div>
        </div>
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Sparkles size={26} />
          </div>
          <h2 className="text-lg font-semibold">Let’s stock your inventory</h2>
          <p className="max-w-md text-sm text-gray-500">
            Your dashboard will light up with stock values, charts and alerts once you add items.
            Start by adding your first item, importing a CSV, or creating a purchase order.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link href="/items?new=1" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700">Add first item</Link>
            <Link href="/items" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">Import CSV</Link>
            <Link href="/contacts?tab=suppliers" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">Add a supplier</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-500">What’s happening across {org?.name ?? "your organization"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateFilter current={rangeKey} />
          <QuickActions />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{k.label}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">{k.value}</p>
                <p className="mt-0.5 text-xs text-gray-500">{k.sub}</p>
              </div>
              <div className={`rounded-xl p-2.5 ${k.tone}`}>
                <k.icon size={20} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Sales / purchases headline for the selected range */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="flex items-center gap-4 p-4">
          <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><DollarSign size={20} /></div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Sales ({rangeKey})</p>
            <p className="text-xl font-bold">{fmtMoney(salesTotal, sym)}</p>
            <p className="flex items-center gap-1 text-xs text-gray-500">
              {salesDelta >= 0 ? <ArrowUpRight size={13} className="text-emerald-600" /> : <ArrowDownRight size={13} className="text-red-600" />}
              {salesDelta >= 0 ? "+" : ""}{salesDelta.toFixed(1)}% vs prior period · {salesNow.length} orders
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-4">
          <div className="rounded-xl bg-violet-50 p-2.5 text-violet-600"><Truck size={20} /></div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Purchases ({rangeKey})</p>
            <p className="text-xl font-bold">{fmtMoney(purchaseTotal, sym)}</p>
            <p className="text-xs text-gray-500">{purchasesNow.length} purchase orders</p>
          </div>
        </Card>
      </div>

      <DashboardCharts salesSeries={salesSeries} inOut={inOut} currencySymbol={sym} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Stock alerts */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle size={16} className="text-amber-500" /> Stock alerts
            </h2>
            <Link href="/inventory?tab=stock&filter=low" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              View inventory →
            </Link>
          </div>
          {lowStock.length === 0 && outOfStock.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No alerts — stock levels look healthy 🎉</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {outOfStock.slice(0, 3).map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-lg">{p.imageEmoji ?? "📦"}</span>
                  <Link href={`/items/${p.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium hover:text-brand-600">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.sku}</p>
                  </Link>
                  <Badge color="red"><PackageX size={12} /> out of stock</Badge>
                </li>
              ))}
              {lowStock.slice(0, 4).map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-lg">{p.imageEmoji ?? "📦"}</span>
                  <Link href={`/items/${p.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium hover:text-brand-600">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.sku}</p>
                  </Link>
                  <Badge color="amber">{p.total} left · reorder at {p.reorderPoint}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent activity */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
          {activities.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Activity will appear here as your team works.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {activities.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-600">
                    {(a.user?.name ?? "Sys").split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </div>
                  <p className="min-w-0 flex-1 truncate text-sm text-gray-700">
                    <span className="font-medium">{a.user?.name ?? "System"}</span> {a.action}
                    {a.detail && <span className="text-gray-400"> · {a.detail}</span>}
                  </p>
                  <span className="shrink-0 text-xs text-gray-400">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Pending orders */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><ShoppingCart size={15} /> Pending sales orders</h2>
            <Link href="/sales?tab=orders" className="text-xs font-medium text-brand-600 hover:text-brand-700">View all →</Link>
          </div>
          {pendingSOs.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No sales orders awaiting fulfilment.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {pendingSOs.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Link href={`/sales/${o.id}`} className="font-mono text-xs font-semibold hover:text-brand-600">{o.number}</Link>
                  <span className="min-w-0 flex-1 truncate text-gray-600">{o.customer.name}</span>
                  <span className="text-xs text-gray-400">{fmtDate(o.orderDate)}</span>
                  <span className="font-medium">{fmtMoney(o.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0), sym)}</span>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Truck size={15} /> Pending purchase orders</h2>
            <Link href="/purchases?tab=orders" className="text-xs font-medium text-brand-600 hover:text-brand-700">View all →</Link>
          </div>
          {pendingPOs.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No purchase orders awaiting receipt.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {pendingPOs.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Link href={`/purchases/${o.id}`} className="font-mono text-xs font-semibold hover:text-brand-600">{o.number}</Link>
                  <span className="min-w-0 flex-1 truncate text-gray-600">{o.supplier.name}</span>
                  <span className="text-xs text-gray-400">{o.expectedDate ? `expected ${fmtDate(o.expectedDate)}` : fmtDate(o.orderDate)}</span>
                  <span className="font-medium">{fmtMoney(o.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0), sym)}</span>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
