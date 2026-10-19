import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/format";
import SoActions from "./so-actions";

export const dynamic = "force-dynamic";

export default async function SoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [so, org] = await Promise.all([
    db.salesOrder.findUnique({
      where: { id },
      include: { customer: true, warehouse: true, lines: { include: { product: true } }, invoices: true },
    }),
    db.organization.findUnique({ where: { id: 1 } }),
  ]);
  if (!so) notFound();
  const sym = org?.currencySymbol ?? "$";
  const subtotal = so.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const tax = so.lines.reduce((s, l) => s + (l.quantity * l.unitPrice * l.product.taxRatePct) / 100, 0);

  return (
    <div className="space-y-5">
      <Link href="/sales" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> Back to sales
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-xl font-bold">{so.number}</h1>
            <StatusBadge status={so.status} />
            {so.isReturn && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">SALES RETURN</span>}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {so.customer.name} · fulfilled from {so.warehouse.name} · {fmtDate(so.orderDate)}
          </p>
          {so.note && <p className="mt-1 text-sm text-gray-400">“{so.note}”</p>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-gray-400">Order total (incl. tax)</p>
          <p className="text-2xl font-bold">{fmtMoney(subtotal + tax, sym)}</p>
          <p className="text-xs text-gray-400">subtotal {fmtMoney(subtotal, sym)} + tax {fmtMoney(tax, sym)}</p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-2 py-3 text-right font-medium">Unit price</th>
              <th className="px-2 py-3 text-right font-medium">Qty</th>
              <th className="px-2 py-3 text-right font-medium">Fulfilled</th>
              <th className="px-2 py-3 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {so.lines.map((l) => (
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
                <td className="px-2 py-2.5 text-right text-gray-500">{fmtMoney(l.unitPrice, sym)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{l.quantity}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  <span className={l.fulfilledQty >= l.quantity ? "font-medium text-emerald-600" : ""}>{l.fulfilledQty}</span>
                </td>
                <td className="px-2 py-2.5 text-right font-medium">{fmtMoney(l.quantity * l.unitPrice, sym)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {so.invoices.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold">Invoices</h2>
          <ul className="divide-y divide-gray-50">
            {so.invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                <Link href="/invoices" className="font-mono text-xs font-semibold hover:text-brand-600">{inv.number}</Link>
                <span className="text-gray-500">due {fmtDate(inv.dueAt)}</span>
                <span className="font-medium">{fmtMoney(inv.amount, sym)}</span>
                <StatusBadge status={inv.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SoActions
        soId={so.id}
        status={so.status}
        isReturn={so.isReturn}
        hasInvoice={so.invoices.length > 0}
      />
    </div>
  );
}
