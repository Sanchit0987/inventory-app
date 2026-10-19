"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyStockDelta, checkStockAlerts, nextNumber } from "@/lib/stock";
import type { FormState } from "./products";

const supplierSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
});

export async function createSupplier(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSession();
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const s = await db.supplier.create({
    data: { name: d.name, email: d.email || null, phone: d.phone || null, address: d.address || null },
  });
  await logActivity(user.id, "created supplier", "Supplier", s.id, s.name);
  revalidatePath("/purchases");
  return { success: true };
}

const poSchema = z.object({
  supplierId: z.string().min(1, "Pick a supplier"),
  warehouseId: z.string().min(1, "Pick a warehouse"),
  expectedDate: z.string().optional().or(z.literal("")),
  note: z.string().max(500).optional().or(z.literal("")),
  isReturn: z.coerce.boolean().default(false),
});

const lineSchema = z
  .array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().positive(), unitCost: z.coerce.number().min(0) }))
  .min(1);

export async function createPurchaseOrder(
  lines: { productId: string; quantity: number; unitCost: number }[],
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireSession();
  const parsed = poSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const validLines = lineSchema.safeParse(lines);
  if (!validLines.success) return { error: "Add at least one product line" };
  const d = parsed.data;

  try {
    const number = await nextNumber(d.isReturn ? "PR" : "PO");
    const po = await db.purchaseOrder.create({
      data: {
        number,
        supplierId: d.supplierId,
        warehouseId: d.warehouseId,
        status: "ORDERED",
        expectedDate: d.expectedDate ? new Date(d.expectedDate) : null,
        note: d.note || null,
        isReturn: d.isReturn,
        lines: { create: validLines.data },
      },
    });
    // supplier return ships goods OUT immediately
    if (d.isReturn) {
      await db.$transaction(async (tx) => {
        for (const line of validLines.data) {
          await applyStockDelta(tx, {
            productId: line.productId, warehouseId: d.warehouseId,
            delta: -line.quantity, type: "SUPPLIER_RETURN", reference: number, userId: user.id,
          });
        }
        await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: "RECEIVED" } });
      });
      for (const line of validLines.data) await checkStockAlerts(line.productId);
    }
    await logActivity(user.id, d.isReturn ? "created supplier return" : "created purchase order", "PurchaseOrder", po.id, number);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create order" };
  }
  revalidatePath("/purchases");
  revalidatePath("/dashboard");
  return { success: true };
}

/** Receive goods against a PO (full or partial). quantities keyed by line id. */
export async function receiveGoods(poId: string, quantities: Record<string, number>): Promise<FormState> {
  const user = await requireSession();
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: true } });
  if (!po) return { error: "Purchase order not found" };
  if (po.isReturn) return { error: "Cannot receive against a return" };
  if (po.status === "RECEIVED" || po.status === "CANCELLED") return { error: `Order is already ${po.status.toLowerCase()}` };

  try {
    await db.$transaction(async (tx) => {
      for (const line of po.lines) {
        const qty = Math.floor(quantities[line.id] ?? 0);
        if (qty <= 0) continue;
        const remaining = line.quantity - line.receivedQty;
        if (qty > remaining) throw new Error(`Cannot receive ${qty}: only ${remaining} outstanding on a line`);
        await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: line.receivedQty + qty } });
        await applyStockDelta(tx, {
          productId: line.productId, warehouseId: po.warehouseId,
          delta: qty, type: "PURCHASE_RECEIPT", reference: po.number, userId: user.id,
        });
      }
      const updated = await tx.purchaseOrderLine.findMany({ where: { poId } });
      const allReceived = updated.every((l) => l.receivedQty >= l.quantity);
      const anyReceived = updated.some((l) => l.receivedQty > 0);
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: allReceived ? "RECEIVED" : anyReceived ? "PARTIAL" : po.status },
      });
    });
    for (const line of po.lines) await checkStockAlerts(line.productId);
    await logActivity(user.id, "received goods", "PurchaseOrder", poId, po.number);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Goods receipt failed" };
  }
  revalidatePath("/purchases");
  revalidatePath(`/purchases/${poId}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { success: true };
}

/** Mark a received PO's bill as paid (Purchases → Bills tab). */
export async function markBillPaid(poId: string): Promise<FormState> {
  const user = await requireSession();
  const po = await db.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) return { error: "Purchase order not found" };
  if (po.billPaid) return { error: "Bill is already paid" };
  if (po.status !== "RECEIVED" && po.status !== "PARTIAL") return { error: "Bill is payable once goods are received" };
  await db.purchaseOrder.update({ where: { id: poId }, data: { billPaid: true, billPaidAt: new Date() } });
  await logActivity(user.id, "paid supplier bill", "PurchaseOrder", poId, po.number);
  revalidatePath("/purchases");
  return { success: true };
}

export async function cancelPurchaseOrder(poId: string): Promise<FormState> {
  const user = await requireSession();
  const po = await db.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) return { error: "Not found" };
  if (po.status === "RECEIVED") return { error: "Cannot cancel a fully received order" };
  await db.purchaseOrder.update({ where: { id: poId }, data: { status: "CANCELLED" } });
  await logActivity(user.id, "cancelled purchase order", "PurchaseOrder", poId, po.number);
  revalidatePath("/purchases");
  revalidatePath(`/purchases/${poId}`);
  return { success: true };
}
