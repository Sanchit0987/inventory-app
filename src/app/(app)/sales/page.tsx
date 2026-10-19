import { db } from "@/lib/db";
import SalesClient from "./sales-client";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const [orders, invoices, customers, warehouses, products, org] = await Promise.all([
    db.salesOrder.findMany({
      orderBy: { createdAt: "desc" },
      include: { customer: true, warehouse: true, lines: true, invoices: true },
    }),
    db.invoice.findMany({
      orderBy: { issuedAt: "desc" },
      include: { so: { include: { customer: true } } },
    }),
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.warehouse.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    db.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { stockLevels: true },
    }),
    db.organization.findUnique({ where: { id: 1 } }),
  ]);

  const now = new Date();

  return (
    <SalesClient
      orders={orders.map((o) => ({
        id: o.id,
        number: o.number,
        customerName: o.customer.name,
        warehouseName: o.warehouse.name,
        status: o.status,
        isReturn: o.isReturn,
        orderDate: o.orderDate.toISOString(),
        total: o.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
        units: o.lines.reduce((s, l) => s + l.quantity, 0),
        fulfilledUnits: o.lines.reduce((s, l) => s + l.fulfilledQty, 0),
        hasInvoice: o.invoices.length > 0,
      }))}
      invoices={invoices.map((i) => ({
        id: i.id,
        number: i.number,
        soNumber: i.so.number,
        soId: i.soId,
        customerName: i.so.customer.name,
        status: i.status === "SENT" && i.dueAt < now ? "OVERDUE" : i.status,
        amount: i.amount,
        issuedAt: i.issuedAt.toISOString(),
        dueAt: i.dueAt.toISOString(),
      }))}
      customers={customers}
      warehouses={warehouses}
      products={products.map((p) => ({
        id: p.id, name: p.name, sku: p.sku, imageEmoji: p.imageEmoji,
        sellingPrice: p.sellingPrice,
        totalStock: p.stockLevels.reduce((s, l) => s + l.quantity, 0),
      }))}
      currencySymbol={org?.currencySymbol ?? "$"}
    />
  );
}
