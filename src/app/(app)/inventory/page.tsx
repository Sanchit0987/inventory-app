import { db } from "@/lib/db";
import InventoryClient from "./inventory-client";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [levels, warehouses, products, movements, transfers, openSoLines, openPoLines] = await Promise.all([
    db.stockLevel.findMany({
      include: { product: { include: { category: true } }, warehouse: true },
      orderBy: [{ product: { name: "asc" } }],
    }),
    db.warehouse.findMany({
      orderBy: { code: "asc" },
      include: { stockLevels: { include: { product: true } } },
    }),
    db.product.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, imageEmoji: true } }),
    db.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { product: true, warehouse: true, user: true },
    }),
    db.stockTransfer.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { fromWarehouse: true, toWarehouse: true, lines: { include: { product: true } } },
    }),
    // reserved = confirmed/packed sales lines not yet fulfilled
    db.salesOrderLine.findMany({
      where: { so: { isReturn: false, status: { in: ["CONFIRMED", "PACKED"] } } },
      select: { productId: true, quantity: true, fulfilledQty: true, so: { select: { warehouseId: true } } },
    }),
    // incoming = ordered/partial purchase lines not yet received
    db.purchaseOrderLine.findMany({
      where: { po: { isReturn: false, status: { in: ["ORDERED", "PARTIAL"] } } },
      select: { productId: true, quantity: true, receivedQty: true, po: { select: { warehouseId: true } } },
    }),
  ]);

  // reserved / incoming keyed by product+warehouse
  const reservedMap = new Map<string, number>();
  for (const l of openSoLines) {
    const k = `${l.productId}:${l.so.warehouseId}`;
    reservedMap.set(k, (reservedMap.get(k) ?? 0) + (l.quantity - l.fulfilledQty));
  }
  const incomingMap = new Map<string, number>();
  for (const l of openPoLines) {
    const k = `${l.productId}:${l.po.warehouseId}`;
    incomingMap.set(k, (incomingMap.get(k) ?? 0) + (l.quantity - l.receivedQty));
  }

  return (
    <InventoryClient
      levels={levels.map((l) => ({
        id: l.id,
        productId: l.productId,
        productName: l.product.name,
        sku: l.product.sku,
        emoji: l.product.imageEmoji,
        category: l.product.category?.name ?? null,
        unit: l.product.unit,
        reorderPoint: l.product.reorderPoint,
        warehouseId: l.warehouseId,
        warehouseName: l.warehouse.name,
        quantity: l.quantity,
        reserved: reservedMap.get(`${l.productId}:${l.warehouseId}`) ?? 0,
        incoming: incomingMap.get(`${l.productId}:${l.warehouseId}`) ?? 0,
        binLocation: l.binLocation,
      }))}
      warehouses={warehouses.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
        address: w.address,
        isPrimary: w.isPrimary,
        skuCount: w.stockLevels.filter((l) => l.quantity > 0).length,
        totalUnits: w.stockLevels.reduce((s, l) => s + l.quantity, 0),
        totalValue: w.stockLevels.reduce((s, l) => s + l.quantity * l.product.costPrice, 0),
      }))}
      products={products}
      movements={movements.map((m) => ({
        id: m.id,
        type: m.type,
        productName: m.product.name,
        sku: m.product.sku,
        warehouseName: m.warehouse.name,
        quantity: m.quantity,
        reference: m.reference,
        note: m.note,
        userName: m.user?.name ?? null,
        createdAt: m.createdAt.toISOString(),
      }))}
      transfers={transfers.map((t) => ({
        id: t.id,
        number: t.number,
        from: t.fromWarehouse.name,
        to: t.toWarehouse.name,
        status: t.status,
        lineCount: t.lines.length,
        totalQty: t.lines.reduce((s, l) => s + l.quantity, 0),
        createdAt: t.createdAt.toISOString(),
      }))}
    />
  );
}
