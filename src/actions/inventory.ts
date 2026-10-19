"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyStockDelta, checkStockAlerts, nextNumber } from "@/lib/stock";
import type { FormState } from "./products";

const adjustSchema = z.object({
  productId: z.string().min(1, "Pick a product"),
  warehouseId: z.string().min(1, "Pick a warehouse"),
  delta: z.coerce.number().int().refine((n) => n !== 0, "Quantity change cannot be zero"),
  note: z.string().max(500).optional().or(z.literal("")),
});

export async function adjustStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSession();
  const parsed = adjustSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    await db.$transaction(async (tx) => {
      await applyStockDelta(tx, {
        productId: d.productId,
        warehouseId: d.warehouseId,
        delta: d.delta,
        type: "ADJUSTMENT",
        note: d.note || "Manual adjustment",
        userId: user.id,
      });
    });
    await checkStockAlerts(d.productId);
    await logActivity(user.id, "adjusted stock", "StockLevel", d.productId, `${d.delta > 0 ? "+" : ""}${d.delta}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Adjustment failed" };
  }
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { success: true };
}

const binSchema = z.object({
  stockLevelId: z.string().min(1),
  binLocation: z.string().max(40).optional().or(z.literal("")),
});

export async function setBinLocation(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const parsed = binSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.stockLevel.update({
    where: { id: parsed.data.stockLevelId },
    data: { binLocation: parsed.data.binLocation || null },
  });
  revalidatePath("/inventory");
  revalidatePath("/warehouses");
  return { success: true };
}

const transferSchema = z.object({
  fromWarehouseId: z.string().min(1, "Pick a source warehouse"),
  toWarehouseId: z.string().min(1, "Pick a destination warehouse"),
  note: z.string().max(500).optional().or(z.literal("")),
});

export async function createTransfer(
  lines: { productId: string; quantity: number }[],
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireSession();
  const parsed = transferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.fromWarehouseId === d.toWarehouseId) return { error: "Source and destination must differ" };
  const validLines = z
    .array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().positive() }))
    .min(1, "Add at least one line")
    .safeParse(lines);
  if (!validLines.success) return { error: "Add at least one product line with a positive quantity" };

  try {
    const number = await nextNumber("TR");
    const transfer = await db.$transaction(async (tx) => {
      const t = await tx.stockTransfer.create({
        data: {
          number,
          fromWarehouseId: d.fromWarehouseId,
          toWarehouseId: d.toWarehouseId,
          status: "COMPLETED",
          completedAt: new Date(),
          note: d.note || null,
          lines: { create: validLines.data },
        },
      });
      for (const line of validLines.data) {
        await applyStockDelta(tx, {
          productId: line.productId, warehouseId: d.fromWarehouseId,
          delta: -line.quantity, type: "TRANSFER_OUT", reference: number, userId: user.id,
        });
        await applyStockDelta(tx, {
          productId: line.productId, warehouseId: d.toWarehouseId,
          delta: line.quantity, type: "TRANSFER_IN", reference: number, userId: user.id,
        });
      }
      return t;
    });
    await logActivity(user.id, "created stock transfer", "StockTransfer", transfer.id, number);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Transfer failed" };
  }
  revalidatePath("/inventory");
  revalidatePath("/warehouses");
  return { success: true };
}

const warehouseSchema = z.object({
  code: z.string().min(1, "Code is required").max(16),
  name: z.string().min(1, "Name is required").max(120),
  address: z.string().max(300).optional().or(z.literal("")),
});

export async function createWarehouse(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSession();
  const parsed = warehouseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const dup = await db.warehouse.findUnique({ where: { code: d.code } });
  if (dup) return { error: `Warehouse code "${d.code}" already exists` };
  const wh = await db.warehouse.create({ data: { code: d.code, name: d.name, address: d.address || null } });
  await logActivity(user.id, "created warehouse", "Warehouse", wh.id, wh.name);
  revalidatePath("/warehouses");
  return { success: true };
}

/** Barcode/QR lookup used by the scan feature: matches barcode, SKU, or variant SKU. */
export async function scanLookup(code: string) {
  await requireSession();
  const q = code.trim();
  if (!q) return null;
  const product = await db.product.findFirst({
    where: { OR: [{ barcode: q }, { sku: q }, { variants: { some: { sku: q } } }] },
    include: { stockLevels: { include: { warehouse: true } }, category: true },
  });
  if (!product) return null;
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    emoji: product.imageEmoji,
    category: product.category?.name ?? null,
    sellingPrice: product.sellingPrice,
    unit: product.unit,
    totalStock: product.stockLevels.reduce((s, l) => s + l.quantity, 0),
    levels: product.stockLevels.map((l) => ({
      warehouse: l.warehouse.name,
      qty: l.quantity,
      bin: l.binLocation,
    })),
  };
}
