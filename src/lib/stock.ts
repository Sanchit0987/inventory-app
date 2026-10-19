import { MovementType, Prisma } from "@prisma/client";
import { db } from "./db";

type Tx = Prisma.TransactionClient;

/**
 * Apply a signed stock delta inside a transaction.
 * Writes the StockLevel upsert + StockMovement audit row atomically,
 * and refuses to let stock go negative.
 */
export async function applyStockDelta(
  tx: Tx,
  opts: {
    productId: string;
    warehouseId: string;
    delta: number;
    type: MovementType;
    reference?: string;
    note?: string;
    userId?: string | null;
  }
) {
  const level = await tx.stockLevel.upsert({
    where: { productId_warehouseId: { productId: opts.productId, warehouseId: opts.warehouseId } },
    create: { productId: opts.productId, warehouseId: opts.warehouseId, quantity: 0 },
    update: {},
  });
  const newQty = level.quantity + opts.delta;
  if (newQty < 0) {
    const p = await tx.product.findUnique({ where: { id: opts.productId }, select: { name: true } });
    throw new Error(`Insufficient stock for ${p?.name ?? "product"}: have ${level.quantity}, need ${-opts.delta}`);
  }
  await tx.stockLevel.update({ where: { id: level.id }, data: { quantity: newQty } });
  await tx.stockMovement.create({
    data: {
      type: opts.type,
      productId: opts.productId,
      warehouseId: opts.warehouseId,
      quantity: opts.delta,
      reference: opts.reference,
      note: opts.note,
      userId: opts.userId ?? null,
    },
  });
  return newQty;
}

/** After a stock decrease, raise low/out-of-stock notifications (deduped per product). */
export async function checkStockAlerts(productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { stockLevels: true },
  });
  if (!product) return;
  const total = product.stockLevels.reduce((s, l) => s + l.quantity, 0);

  const existing = await db.notification.findFirst({
    where: {
      read: false,
      type: { in: ["LOW_STOCK", "OUT_OF_STOCK"] },
      message: { contains: `[${product.sku}]` },
    },
  });

  if (total === 0) {
    if (existing?.type !== "OUT_OF_STOCK") {
      if (existing) await db.notification.delete({ where: { id: existing.id } });
      await db.notification.create({
        data: {
          type: "OUT_OF_STOCK",
          title: "Out of stock",
          message: `${product.name} [${product.sku}] is out of stock.`,
          link: `/items/${product.id}`,
        },
      });
    }
  } else if (total <= product.reorderPoint) {
    if (!existing) {
      await db.notification.create({
        data: {
          type: "LOW_STOCK",
          title: "Low stock",
          message: `${product.name} [${product.sku}] is at ${total} ${product.unit} (reorder point ${product.reorderPoint}).`,
          link: `/items/${product.id}`,
        },
      });
    }
  } else if (existing) {
    // stock recovered — clear the stale alert
    await db.notification.delete({ where: { id: existing.id } });
  }
}

/** Next sequential document number like SO-0042 */
export async function nextNumber(prefix: "SO" | "PO" | "INV" | "TR" | "SR" | "PR") {
  // Atomic upsert+increment on DocCounter: concurrent requests never produce
  // duplicate numbers (the previous count()-based numbering raced).
  const counter = await db.docCounter.upsert({
    where: { id: prefix },
    create: { id: prefix, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${String(counter.value).padStart(4, "0")}`;
}

/** Seed helper: fast-forward counters past existing seeded documents. */
export async function syncCounters() {
  const pairs: ("SO" | "PO" | "INV" | "TR")[] = ["SO", "PO", "INV", "TR"];
  const counts = await Promise.all([
    db.salesOrder.count(),
    db.purchaseOrder.count(),
    db.invoice.count(),
    db.stockTransfer.count(),
  ]);
  for (let i = 0; i < pairs.length; i++) {
    await db.docCounter.upsert({
      where: { id: pairs[i] },
      create: { id: pairs[i], value: counts[i] },
      update: { value: counts[i] },
    });
  }
}
