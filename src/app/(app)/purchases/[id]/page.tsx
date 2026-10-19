import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/format";
import ReceiveGoods from "./receive-goods";

export const dynamic = "force-dynamic";

export default async function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [po, org] = await Promise.all([
    db.purchaseOrder.findUnique({
      where: { id },
      include: { supplier: true, warehouse: true, lines: { include: { product: true } } },
    }),
    db.organization.findUnique({ where: { id: 1 } }),
  ]);
  if (!po) notFound();
  const sym = org?.currencySymbol ?? "$";
  const total = po.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  const receivable = !po.isReturn && (po.status === "ORDERED" || po.status === "PARTIAL");

  return (
    <div className="space-y-5">
      <Link href="/purchases" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> Back to purchases
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-xl font-bold">{po.number}</h1>
            <StatusBadge status={po.status} />
            {po.isReturn && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">SUPPLIER RETURN</span>}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {po.supplier.name} → {po.warehouse.name} · ordered {fmtDate(po.orderDate)}
            {po.expectedDate && ` · expected ${fmtDate(po.expectedDate)}`}
          </p>
          {po.note && <p className="mt-1 text-sm text-gray-400">“{po.note}”</p>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-gray-400">Order total</p>
          <p className="text-2xl font-bold">{fmtMoney(total, sym)}</p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-2 py-3 text-right font-medium">Unit cost</th>
              <th className="px-2 py-3 text-right font-medium">Ordered</th>
              <th className="px-2 py-3 text-right font-medium">Received</th>
              <th className="px-2 py-3 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {po.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-base">{l.product.imageEmoji ?? "📦"}</span>
                    <div>
                      <p className="font-medium">{l.product.name}</p>
                      <p className="font-mono text-xs text-gray-400">{l.product.sku}</p>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right text-gray-500">{fmtMoney(l.unitCost, sym)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{l.quantity}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  <span className={l.receivedQty >= l.quantity ? "text-emerald-600 font-medium" : ""}>{l.receivedQty}</span>
                </td>
                <td className="px-2 py-2.5 text-right font-medium">{fmtMoney(l.quantity * l.unitCost, sym)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {receivable && (
        <ReceiveGoods
          poId={po.id}
          lines={po.lines.map((l) => ({
            id: l.id,
            productName: l.product.name,
            sku: l.product.sku,
            outstanding: l.quantity - l.receivedQty,
          }))}
        />
      )}
    </div>
  );
}
