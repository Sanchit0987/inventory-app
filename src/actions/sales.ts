"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyStockDelta, checkStockAlerts, nextNumber } from "@/lib/stock";
import type { FormState } from "./products";

const customerSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
});

export async function createCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSession();
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const c = await db.customer.create({
    data: { name: d.name, email: d.email || null, phone: d.phone || null, address: d.address || null },
  });
  await logActivity(user.id, "created customer", "Customer", c.id, c.name);
  revalidatePath("/sales");
  return { success: true };
}

const soSchema = z.object({
  customerId: z.string().min(1, "Pick a customer"),
  warehouseId: z.string().min(1, "Pick a warehouse"),
  note: z.string().max(500).optional().or(z.literal("")),
  isReturn: z.coerce.boolean().default(false),
});

const lineSchema = z
  .array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().positive(), unitPrice: z.coerce.number().min(0) }))
  .min(1);

export async function createSalesOrder(
  lines: { productId: string; quantity: number; unitPrice: number }[],
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireSession();
  const parsed = soSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const validLines = lineSchema.safeParse(lines);
  if (!validLines.success) return { error: "Add at least one product line" };
  const d = parsed.data;

  try {
    const number = await nextNumber(d.isReturn ? "SR" : "SO");
    const so = await db.salesOrder.create({
      data: {
        number,
        customerId: d.customerId,
        warehouseId: d.warehouseId,
        status: "CONFIRMED",
        note: d.note || null,
        isReturn: d.isReturn,
        lines: { create: validLines.data },
      },
    });
    // sales return receives goods back IN immediately
    if (d.isReturn) {
      await db.$transaction(async (tx) => {
        for (const line of validLines.data) {
          await applyStockDelta(tx, {
            productId: line.productId, warehouseId: d.warehouseId,
            delta: line.quantity, type: "SALES_RETURN", reference: number, userId: user.id,
          });
        }
        await tx.salesOrder.update({ where: { id: so.id }, data: { status: "DELIVERED" } });
      });
      for (const line of validLines.data) await checkStockAlerts(line.productId);
    } else {
      // pending-order reminder notification
      await db.notification.create({
        data: {
          type: "ORDER_PENDING",
          title: "Order awaiting fulfilment",
          message: `${number} for ${validLines.data.length} line(s) is confirmed and awaiting fulfilment.`,
          link: `/sales/${so.id}`,
        },
      });
    }
    await logActivity(user.id, d.isReturn ? "created sales return" : "created sales order", "SalesOrder", so.id, number);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create order" };
  }
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  return { success: true };
}

/** Fulfil (ship) a sales order: deduct stock, advance status. */
export async function fulfillSalesOrder(soId: string): Promise<FormState> {
  const user = await requireSession();
  const so = await db.salesOrder.findUnique({ where: { id: soId }, include: { lines: true } });
  if (!so) return { error: "Sales order not found" };
  if (so.isReturn) return { error: "Returns are fulfilled automatically" };
  if (so.status !== "CONFIRMED" && so.status !== "PACKED") return { error: `Order is ${so.status.toLowerCase()} — nothing to fulfil` };

  try {
    await db.$transaction(async (tx) => {
      for (const line of so.lines) {
        const remaining = line.quantity - line.fulfilledQty;
        if (remaining <= 0) continue;
        await applyStockDelta(tx, {
          productId: line.productId, warehouseId: so.warehouseId,
          delta: -remaining, type: "SALE_SHIPMENT", reference: so.number, userId: user.id,
        });
        await tx.salesOrderLine.update({ where: { id: line.id }, data: { fulfilledQty: line.quantity } });
      }
      await tx.salesOrder.update({ where: { id: soId }, data: { status: "SHIPPED" } });
    });
    for (const line of so.lines) await checkStockAlerts(line.productId);
    await logActivity(user.id, "fulfilled sales order", "SalesOrder", soId, so.number);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fulfilment failed" };
  }
  revalidatePath("/sales");
  revalidatePath(`/sales/${soId}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function markDelivered(soId: string): Promise<FormState> {
  const user = await requireSession();
  const so = await db.salesOrder.findUnique({ where: { id: soId } });
  if (!so || so.status !== "SHIPPED") return { error: "Order must be shipped first" };
  await db.salesOrder.update({ where: { id: soId }, data: { status: "DELIVERED" } });
  await logActivity(user.id, "marked delivered", "SalesOrder", soId, so.number);
  revalidatePath("/sales");
  revalidatePath(`/sales/${soId}`);
  return { success: true };
}

export async function cancelSalesOrder(soId: string): Promise<FormState> {
  const user = await requireSession();
  const so = await db.salesOrder.findUnique({ where: { id: soId } });
  if (!so) return { error: "Not found" };
  if (so.status === "SHIPPED" || so.status === "DELIVERED") return { error: "Cannot cancel a shipped order" };
  await db.salesOrder.update({ where: { id: soId }, data: { status: "CANCELLED" } });
  await logActivity(user.id, "cancelled sales order", "SalesOrder", soId, so.number);
  revalidatePath("/sales");
  revalidatePath(`/sales/${soId}`);
  return { success: true };
}

/** Generate an invoice for a sales order. */
export async function createInvoice(soId: string): Promise<FormState> {
  const user = await requireSession();
  const so = await db.salesOrder.findUnique({
    where: { id: soId },
    include: { lines: { include: { product: true } }, invoices: true },
  });
  if (!so) return { error: "Sales order not found" };
  if (so.status === "DRAFT" || so.status === "CANCELLED") return { error: "Confirm the order before invoicing" };
  if (so.invoices.length) return { error: "An invoice already exists for this order" };

  const amount = so.lines.reduce((sum, l) => {
    const net = l.quantity * l.unitPrice;
    return sum + net + (net * l.product.taxRatePct) / 100;
  }, 0);
  const number = await nextNumber("INV");
  const due = new Date();
  due.setDate(due.getDate() + 30);
  await db.invoice.create({
    data: { number, soId, status: "SENT", amount: Math.round(amount * 100) / 100, dueAt: due },
  });
  await logActivity(user.id, "created invoice", "Invoice", soId, number);
  revalidatePath("/sales");
  revalidatePath(`/sales/${soId}`);
  revalidatePath("/invoices");
  return { success: true };
}

export async function markInvoicePaid(invoiceId: string): Promise<FormState> {
  const user = await requireSession();
  const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return { error: "Invoice not found" };
  if (inv.status === "PAID") return { error: "Already paid" };
  await db.invoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: new Date() } });
  await logActivity(user.id, "marked invoice paid", "Invoice", invoiceId, inv.number);
  revalidatePath("/invoices");
  revalidatePath("/sales");
  return { success: true };
}
