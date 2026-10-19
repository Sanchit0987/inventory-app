"use client";

import { AlertTriangle, ChevronDown, Download, Rabbit, Turtle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Badge, Button, Card, PageHeader, cls, useToast } from "@/components/ui";
import { fmtMoney } from "@/lib/format";

const PIE_COLORS = ["#3d63f1", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

type Mover = { id: string; name: string; sku: string; emoji: string | null; sold: number; stock: number; revenue: number };
type LowStockRow = { id: string; name: string; sku: string; emoji: string | null; stock: number; reorderPoint: number };
type ValuationRow = { name: string; sku: string; category: string; qty: number; costPrice: number; value: number };

export default function ReportsClient({
  rangeKey, whFilter, warehouses, valuationByCat, valuationRows, weeks,
  fastMovers, slowMovers, lowStockReport, movementBreakdown, totals, currencySymbol,
}: {
  rangeKey: string;
  whFilter: string;
  warehouses: { id: string; code: string; name: string }[];
  valuationByCat: { category: string; value: number; units: number }[];
  valuationRows: ValuationRow[];
  weeks: { label: string; sales: number; purchases: number }[];
  fastMovers: Mover[];
  slowMovers: Mover[];
  lowStockReport: LowStockRow[];
  movementBreakdown: { type: string; count: number; units: number }[];
  totals: { inventoryValue: number; retailValue: number; sales: number; purchases: number };
  currencySymbol: string;
}) {
  const sym = currencySymbol;
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  const setParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    router.push(`/reports?${sp.toString()}`);
  };

  const exportCsv = (filename: string, header: string, rows: string[]) => {
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("success", `Exported ${rows.length} row(s)`);
  };

  const exportValuation = () =>
    exportCsv("inventory-valuation.csv", "name,sku,category,qty,costPrice,value",
      valuationRows.map((r) => [`"${r.name.replace(/"/g, '""')}"`, r.sku, r.category, r.qty, r.costPrice, r.value].join(",")));

  const exportMovers = () =>
    exportCsv("product-movement.csv", "name,sku,sold,stock,revenue",
      [...fastMovers, ...slowMovers.filter((s) => !fastMovers.some((f) => f.id === s.id))]
        .map((m) => [`"${m.name.replace(/"/g, '""')}"`, m.sku, m.sold, m.stock, m.revenue.toFixed(2)].join(",")));

  const exportLowStock = () =>
    exportCsv("low-stock.csv", "name,sku,stock,reorderPoint",
      lowStockReport.map((r) => [`"${r.name.replace(/"/g, '""')}"`, r.sku, r.stock, r.reorderPoint].join(",")));

  const kpis = [
    { label: "Inventory value (cost)", value: fmtMoney(totals.inventoryValue, sym) },
    { label: "Inventory value (retail)", value: fmtMoney(totals.retailValue, sym) },
    { label: `Sales (${rangeKey})`, value: fmtMoney(totals.sales, sym) },
    { label: `Purchases (${rangeKey})`, value: fmtMoney(totals.purchases, sym) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Valuation, trading performance and movement analytics"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Reports" }]}
        actions={
          <Button variant="secondary" onClick={exportValuation}>
            <Download size={15} /> Export valuation CSV
          </Button>
        }
      />

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          {["30d", "90d", "180d"].map((r) => (
            <button key={r} onClick={() => setParam("range", r)}
              className={cls("rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                rangeKey === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800")}>
              {r}
            </button>
          ))}
        </div>
        <div className="relative">
          <select value={whFilter} onChange={(e) => setParam("wh", e.target.value)}
            className="appearance-none rounded-lg bg-gray-100 py-2 pl-3 pr-8 text-sm outline-none ring-brand-500 focus:bg-white focus:ring-2 cursor-pointer">
            <option value="">All warehouses</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{k.label}</p>
            <p className="mt-1 text-xl font-bold">{k.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Sales vs purchases</h2>
          <p className="mb-3 text-xs text-gray-400">Order value per week</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `${sym}${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                <Tooltip formatter={(v) => fmtMoney(Number(v), sym)} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sales" name="Sales" fill="#3d63f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="purchases" name="Purchases" fill="#c4b5fd" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Inventory valuation by category</h2>
          <p className="mb-3 text-xs text-gray-400">At cost price</p>
          {valuationByCat.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-400">No stocked items for this filter.</p>
          ) : (
            <div className="flex h-64 items-center">
              <ResponsiveContainer width="55%" height="100%">
                <PieChart>
                  <Pie data={valuationByCat} dataKey="value" nameKey="category" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {valuationByCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtMoney(Number(v), sym)} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex-1 space-y-1.5 text-sm">
                {valuationByCat.map((v, i) => (
                  <li key={v.category} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="min-w-0 flex-1 truncate text-gray-600">{v.category}</span>
                    <span className="font-medium">{fmtMoney(v.value, sym)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MoverTable title="Fast movers" subtitle={`Most units sold (${rangeKey})`} icon={<Rabbit size={16} className="text-emerald-600" />} movers={fastMovers} sym={sym} onExport={exportMovers} />
        <MoverTable title="Slow movers" subtitle="Least units sold with stock on hand" icon={<Turtle size={16} className="text-amber-600" />} movers={slowMovers} sym={sym} onExport={exportMovers} />
      </div>

      {/* Low stock report */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle size={15} className="text-amber-500" /> Low stock report ({lowStockReport.length})
          </h2>
          <Button variant="ghost" onClick={exportLowStock} className="!py-1 text-xs">
            <Download size={13} /> CSV
          </Button>
        </div>
        {lowStockReport.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">All items are above their reorder points 🎉</p>
        ) : (
          <div className="scroll-thin max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {lowStockReport.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/70">
                    <td className="px-5 py-2">
                      <Link href={`/items/${r.id}`} className="flex items-center gap-2 font-medium hover:text-brand-600">
                        <span>{r.emoji ?? "📦"}</span> {r.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-gray-400">{r.sku}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.stock} in stock</td>
                    <td className="px-2 py-2 text-right text-xs text-gray-400">reorder at {r.reorderPoint}</td>
                    <td className="px-2 py-2">
                      {r.stock === 0 ? <Badge color="red">out of stock</Badge> : <Badge color="amber">low</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">Stock movement breakdown ({rangeKey})</h2>
        {movementBreakdown.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No movements in this period.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {movementBreakdown.map((m) => (
              <div key={m.type} className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-lg font-bold tabular-nums">{m.units.toLocaleString()}</p>
                <p className="text-[11px] text-gray-500">units · {m.count} moves</p>
                <p className="mt-1 text-xs font-medium capitalize text-gray-700">{m.type}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function MoverTable({
  title, subtitle, icon, movers, sym, onExport,
}: { title: string; subtitle: string; icon: React.ReactNode; movers: Mover[]; sym: string; onExport: () => void }) {
  const max = Math.max(...movers.map((m) => m.sold), 1);
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">{icon} {title}</h2>
        <Button variant="ghost" onClick={onExport} className="!py-1 text-xs"><Download size={13} /> CSV</Button>
      </div>
      <p className="mb-3 text-xs text-gray-400">{subtitle}</p>
      {movers.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Not enough data yet.</p>
      ) : (
        <ul className="space-y-2">
          {movers.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <span className="text-base">{m.emoji ?? "📦"}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/items/${m.id}`} className="block truncate text-sm font-medium hover:text-brand-600">{m.name}</Link>
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-brand-400" style={{ width: `${(m.sold / max) * 100}%` }} />
                </div>
              </div>
              <div className="w-24 text-right">
                <p className="text-sm font-semibold tabular-nums">{m.sold} sold</p>
                <p className="text-[11px] text-gray-400">{m.stock} in stock · {fmtMoney(m.revenue, sym)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
