"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity, requireRole, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

const productSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  sku: z.string().min(1, "SKU is required").max(64),
  barcode: z.string().max(64).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  categoryId: z.string().optional().or(z.literal("")),
  supplierId: z.string().optional().or(z.literal("")),
  imageEmoji: z.string().max(8).optional().or(z.literal("")),
  costPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  taxRatePct: z.coerce.number().min(0).max(100).default(0),
  unit: z.string().min(1).max(20).default("pcs"),
  reorderPoint: z.coerce.number().int().min(0).default(0),
});

const openingStockSchema = z.object({
  openingStock: z.coerce.number().int().min(0).default(0),
  openingWarehouseId: z.string().optional().or(z.literal("")),
});

export type FormState = { error?: string; success?: boolean } | undefined;

function parseVariants(formData: FormData): { name: string; sku: string; extraPrice: number }[] {
  const raw = formData.get("variants");
  if (!raw || typeof raw !== "string" || !raw.trim()) return [];
  const parsed = z
    .array(z.object({ name: z.string().min(1), sku: z.string().min(1), extraPrice: z.coerce.number() }))
    .safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : [];
}

export async function createProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSession();
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const dup = await db.product.findUnique({ where: { sku: d.sku } });
  if (dup) return { error: `SKU "${d.sku}" already exists` };

  try {
    const opening = openingStockSchema.safeParse(Object.fromEntries(formData));
    const openingStock = opening.success ? opening.data.openingStock : 0;
    const openingWarehouseId = opening.success ? (opening.data.openingWarehouseId || "") : "";
    const product = await db.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          name: d.name,
          sku: d.sku,
          barcode: d.barcode || null,
          description: d.description || null,
          categoryId: d.categoryId || null,
          supplierId: d.supplierId || null,
          imageEmoji: d.imageEmoji || null,
          costPrice: d.costPrice,
          sellingPrice: d.sellingPrice,
          taxRatePct: d.taxRatePct,
          unit: d.unit,
          reorderPoint: d.reorderPoint,
          variants: { create: parseVariants(formData) },
        },
      });
      // opening stock creates a level + an audited ADJUSTMENT movement
      if (openingStock > 0 && openingWarehouseId) {
        await tx.stockLevel.create({
          data: { productId: p.id, warehouseId: openingWarehouseId, quantity: openingStock },
        });
        await tx.stockMovement.create({
          data: {
            type: "ADJUSTMENT", productId: p.id, warehouseId: openingWarehouseId,
            quantity: openingStock, reference: "OPENING-STOCK", userId: user.id,
          },
        });
      }
      return p;
    });
    await logActivity(user.id, "created product", "Product", product.id, product.name);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create product" };
  }
  revalidatePath("/items");
  revalidatePath("/inventory");
  return { success: true };
}

export async function updateProduct(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSession();
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const dup = await db.product.findFirst({ where: { sku: d.sku, NOT: { id } } });
  if (dup) return { error: `SKU "${d.sku}" already exists` };

  try {
    await db.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: d.name,
          sku: d.sku,
          barcode: d.barcode || null,
          description: d.description || null,
          categoryId: d.categoryId || null,
          supplierId: d.supplierId || null,
          imageEmoji: d.imageEmoji || null,
          costPrice: d.costPrice,
          sellingPrice: d.sellingPrice,
          taxRatePct: d.taxRatePct,
          unit: d.unit,
          reorderPoint: d.reorderPoint,
        },
      });
      await tx.productVariant.deleteMany({ where: { productId: id } });
      const variants = parseVariants(formData);
      if (variants.length) {
        await tx.productVariant.createMany({ data: variants.map((v) => ({ ...v, productId: id })) });
      }
    });
    await logActivity(user.id, "updated product", "Product", id, d.name);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update product" };
  }
  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  return { success: true };
}

/** Inline edit of a single numeric field from the products table */
export async function inlineUpdateProduct(id: string, field: string, value: number): Promise<FormState> {
  await requireSession();
  const allowed = ["sellingPrice", "costPrice", "reorderPoint"] as const;
  if (!allowed.includes(field as (typeof allowed)[number])) return { error: "Field not editable" };
  const num = z.coerce.number().min(0).safeParse(value);
  if (!num.success) return { error: "Invalid value" };
  await db.product.update({
    where: { id },
    data: { [field]: field === "reorderPoint" ? Math.round(num.data) : num.data },
  });
  revalidatePath("/items");
  return { success: true };
}

export async function deleteProducts(ids: string[]): Promise<FormState> {
  const user = await requireRole("MANAGER");
  if (!ids.length) return { error: "Nothing selected" };
  // block deletion when the product appears on orders (keeps history intact)
  const used = await db.product.findFirst({
    where: { id: { in: ids }, OR: [{ poLines: { some: {} } }, { soLines: { some: {} } }] },
    select: { name: true },
  });
  if (used) return { error: `"${used.name}" is used on orders — archive it instead` };
  await db.product.deleteMany({ where: { id: { in: ids } } });
  await logActivity(user.id, "deleted products", "Product", undefined, `${ids.length} item(s)`);
  revalidatePath("/items");
  return { success: true };
}

export async function setProductsActive(ids: string[], active: boolean): Promise<FormState> {
  const user = await requireSession();
  await db.product.updateMany({ where: { id: { in: ids } }, data: { isActive: active } });
  await logActivity(user.id, active ? "activated products" : "archived products", "Product", undefined, `${ids.length} item(s)`);
  revalidatePath("/items");
  return { success: true };
}

export async function createCategory(name: string): Promise<{ id?: string; error?: string }> {
  await requireSession();
  const parsed = z.string().min(1).max(80).safeParse(name.trim());
  if (!parsed.success) return { error: "Invalid category name" };
  const existing = await db.category.findUnique({ where: { name: parsed.data } });
  if (existing) return { id: existing.id };
  const cat = await db.category.create({ data: { name: parsed.data } });
  revalidatePath("/items");
  return { id: cat.id };
}
