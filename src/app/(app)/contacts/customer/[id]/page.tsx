import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [customer, org] = await Promise.all([
    db.customer.findUnique({
      where: { id },
      include: {
        salesOrders: {
          orderBy: { createdAt: "desc" },
          include: { lines: true, invoices: true, warehouse: true },
        },
      },
    }),
    db.organization.findUnique({ where: { id: 1 } }),
  ]);
  if (!customer) notFound();
  const sym = org?.currencySymbol ?? "$";

  const orders = customer.salesOrders;
  const lifetime = orders
    .filter((o) => !o.isReturn && o.status !== "CANCELLED")
    .reduce((s, o) => s + o.lines.reduce((x, l) => x + l.quantity * l.unitPrice, 0), 0);
  const invoices = orders.flatMap((o) => o.invoices.map((i) => ({ ...i, soNumber: o.number, soId: o.id })));
  const outstanding = invoices.filter((i) => i.status !== "PAID").reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-5">
      <Link href="/contacts?tab=customers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> Back to contacts
      </Link>

      <PageHeader
        title={customer.name}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Contacts", href: "/contacts?tab=customers" }, { label: customer.name }]}
        description="Customer profile"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Contact details</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {customer.email && <li className="flex items-center gap-2"><Mail size={14} className="text-gray-400" /> {customer.email}</li>}
            {customer.phone && <li className="flex items-center gap-2"><Phone size={14} className="text-gray-400" /> {customer.phone}</li>}
            {customer.address && <li className="flex items-center gap-2"><MapPin size={14} className="text-gray-400" /> {customer.address}</li>}
            {!customer.email && !customer.phone && !customer.address && <li className="text-gray-400">No contact details recorded.</li>}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 text-center">
            <div>
              <p className="text-lg font-bold">{fmtMoney(lifetime, sym)}</p>
              <p className="text-[11px] uppercase text-gray-400">Lifetime value</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-600">{fmtMoney(outstanding, sym)}</p>
              <p className="text-[11px] uppercase text-gray-400">Outstanding</p>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          <h2 className="border-b border-gray-100 px-5 py-3 text-sm font-semibold">Sales history ({orders.length})</h2>
          {orders.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No orders yet.</p>
          ) : (
            <div className="scroll-thin max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {orders.map((o) => (
                    <tr key={o.id} className="group hover:bg-gray-50/70">
                      <td className="px-5 py-2.5">
                        <Link href={`/sales/${o.id}`} className="font-mono text-xs font-semibold group-hover:text-brand-600">
                          {o.number}{o.isReturn && <Badge color="red">return</Badge>}
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 text-gray-500">{fmtDate(o.orderDate)}</td>
                      <td className="px-2 py-2.5 text-gray-500">{o.warehouse.name}</td>
                      <td className="px-2 py-2.5 text-right font-medium">
                        {fmtMoney(o.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0), sym)}
                      </td>
                      <td className="px-2 py-2.5"><StatusBadge status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {invoices.length > 0 && (
        <Card className="overflow-hidden">
          <h2 className="border-b border-gray-100 px-5 py-3 text-sm font-semibold">Invoices ({invoices.length})</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              {invoices.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50/70">
                  <td className="px-5 py-2.5 font-mono text-xs font-semibold">{i.number}</td>
                  <td className="px-2 py-2.5">
                    <Link href={`/sales/${i.soId}`} className="font-mono text-xs text-gray-500 hover:text-brand-600">{i.soNumber}</Link>
                  </td>
                  <td className="px-2 py-2.5 text-gray-500">due {fmtDate(i.dueAt)}</td>
                  <td className="px-2 py-2.5 text-right font-medium">{fmtMoney(i.amount, sym)}</td>
                  <td className="px-2 py-2.5"><StatusBadge status={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
