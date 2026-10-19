import { db } from "@/lib/db";
import ContactsClient from "./contacts-client";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const [customers, suppliers, org] = await Promise.all([
    db.customer.findMany({
      orderBy: { name: "asc" },
      include: {
        salesOrders: { include: { lines: true, invoices: true } },
      },
    }),
    db.supplier.findMany({
      orderBy: { name: "asc" },
      include: {
        purchaseOrders: { include: { lines: true } },
      },
    }),
    db.organization.findUnique({ where: { id: 1 } }),
  ]);

  return (
    <ContactsClient
      customers={customers.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        orderCount: c.salesOrders.filter((o) => !o.isReturn).length,
        totalSpend: c.salesOrders
          .filter((o) => !o.isReturn && o.status !== "CANCELLED")
          .reduce((s, o) => s + o.lines.reduce((x, l) => x + l.quantity * l.unitPrice, 0), 0),
        // outstanding = unpaid invoice amounts
        outstanding: c.salesOrders
          .flatMap((o) => o.invoices)
          .filter((i) => i.status !== "PAID")
          .reduce((s, i) => s + i.amount, 0),
      }))}
      suppliers={suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        orderCount: s.purchaseOrders.filter((o) => !o.isReturn).length,
        totalSpend: s.purchaseOrders
          .filter((o) => !o.isReturn && o.status !== "CANCELLED")
          .reduce((sum, o) => sum + o.lines.reduce((x, l) => x + l.quantity * l.unitCost, 0), 0),
        // outstanding = unpaid bills on received orders
        outstanding: s.purchaseOrders
          .filter((o) => !o.isReturn && !o.billPaid && (o.status === "RECEIVED" || o.status === "PARTIAL"))
          .reduce((sum, o) => sum + o.lines.reduce((x, l) => x + l.quantity * l.unitCost, 0), 0),
      }))}
      currencySymbol={org?.currencySymbol ?? "$"}
    />
  );
}
