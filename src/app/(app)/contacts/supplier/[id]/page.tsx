import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SupplierProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [supplier, org] = await Promise.all([
    db.supplier.findUnique({
      where: { id },
      include: {
        purchaseOrders: {
          orderBy: { createdAt: "desc" },
          include: { lines: true, warehouse: true },
        },
        products: { select: { id: true, name: true, sku: true, imageEmoji: true } },
      },
    }),
    db.organization.findUnique({ where: { id: 1 } }),
  ]);
  if (!supplier) notFound();
  const sym = org?.currencySymbol ?? "$";

  const orders = supplier.purchaseOrders;
  const totalPurchased = orders
    .filter((o) => !o.isReturn && o.status !== "CANCELLED")
    .reduce((s, o) => s + o.lines.reduce((x, l) => x + l.quantity * l.unitCost, 0), 0);
  const outstanding = orders
    .filter((o) => !o.isReturn && !o.billPaid && (o.status === "RECEIVED" || o.status === "PARTIAL"))
    .reduce((s, o) => s + o.lines.reduce((x, l) => x + l.quantity * l.unitCost, 0), 0);

  return (
    <div className="space-y-5">
      <Link href="/contacts?tab=suppliers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> Back to contacts
      </Link>

      <PageHeader
        title={supplier.name}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Contacts", href: "/contacts?tab=suppliers" }, { label: supplier.name }]}
        description="Supplier profile"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Contact details</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {supplier.email && <li className="flex items-center gap-2"><Mail size={14} className="text-gray-400" /> {supplier.email}</li>}
            {supplier.phone && <li className="flex items-center gap-2"><Phone size={14} className="text-gray-400" /> {supplier.phone}</li>}
            {supplier.address && <li className="flex items-center gap-2"><MapPin size={14} className="text-gray-400" /> {supplier.address}</li>}
            {!supplier.email && !supplier.phone && !supplier.address && <li className="text-gray-400">No contact details recorded.</li>}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 text-center">
            <div>
              <p className="text-lg font-bold">{fmtMoney(totalPurchased, sym)}</p>
              <p className="text-[11px] uppercase text-gray-400">Total purchased</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-600">{fmtMoney(outstanding, sym)}</p>
              <p className="text-[11px] uppercase text-gray-400">Unpaid bills</p>
            </div>
          </div>

          {supplier.products.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-sm font-semibold">Supplied items</h3>
              <ul className="space-y-1.5">
                {supplier.products.map((p) => (
                  <li key={p.id}>
                    <Link href={`/items/${p.id}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-brand-600">
                      <span>{p.imageEmoji ?? "📦"}</span> {p.name}
                      <span className="font-mono text-[11px] text-gray-400">{p.sku}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          <h2 className="border-b border-gray-100 px-5 py-3 text-sm font-semibold">Purchase history ({orders.length})</h2>
          {orders.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No purchase orders yet.</p>
          ) : (
            <div className="scroll-thin max-h-[32rem] overflow-y-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {orders.map((o) => (
                    <tr key={o.id} className="group hover:bg-gray-50/70">
                      <td className="px-5 py-2.5">
                        <Link href={`/purchases/${o.id}`} className="font-mono text-xs font-semibold group-hover:text-brand-600">
                          {o.number}{o.isReturn && <Badge color="red">return</Badge>}
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 text-gray-500">{fmtDate(o.orderDate)}</td>
                      <td className="px-2 py-2.5 text-gray-500">{o.warehouse.name}</td>
                      <td className="px-2 py-2.5 text-right font-medium">
                        {fmtMoney(o.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0), sym)}
                      </td>
                      <td className="px-2 py-2.5">
                        {o.billPaid ? <Badge color="green">paid</Badge> : <StatusBadge status={o.status} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
