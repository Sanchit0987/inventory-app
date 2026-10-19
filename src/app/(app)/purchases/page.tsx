import { db } from "@/lib/db";
import PurchasesClient from "./purchases-client";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const [orders, warehouses, products, suppliers, receipts, org] = await Promise.all([
    db.purchaseOrder.findMany({
      orderBy: { createdAt: "desc" },
      include: { supplier: true, warehouse: true, lines: true },
    }),
    db.warehouse.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    db.product.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, imageEmoji: true, costPrice: true } }),
    db.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // goods received = PURCHASE_RECEIPT movements
    db.stockMovement.findMany({
      where: { type: "PURCHASE_RECEIPT" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { product: true, warehouse: true, user: true },
    }),
    db.organization.findUnique({ where: { id: 1 } }),
  ]);

  return (
    <PurchasesClient
      orders={orders.map((o) => ({
        id: o.id,
        number: o.number,
        supplierName: o.supplier.name,
        warehouseName: o.warehouse.name,
        status: o.status,
        isReturn: o.isReturn,
        billPaid: o.billPaid,
        orderDate: o.orderDate.toISOString(),
        expectedDate: o.expectedDate?.toISOString() ?? null,
        total: o.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0),
        received: o.lines.reduce((s, l) => s + l.receivedQty, 0),
        ordered: o.lines.reduce((s, l) => s + l.quantity, 0),
      }))}
      receipts={receipts.map((r) => ({
        id: r.id,
        productName: r.product.name,
        sku: r.product.sku,
        warehouseName: r.warehouse.name,
        quantity: r.quantity,
        reference: r.reference,
        userName: r.user?.name ?? null,
        createdAt: r.createdAt.toISOString(),
      }))}
      suppliers={suppliers}
      warehouses={warehouses}
      products={products}
      currencySymbol={org?.currencySymbol ?? "$"}
    />
  );
}
