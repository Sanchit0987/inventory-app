"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { FormState } from "./products";

const orgStepSchema = z.object({
  name: z.string().min(1, "Company name is required").max(160),
  businessType: z.string().max(80).optional().or(z.literal("")),
  currency: z.string().length(3),
  currencySymbol: z.string().min(1).max(4),
  timezone: z.string().min(1).max(64),
});

/** Step 1: company profile */
export async function onboardingCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const parsed = orgStepSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  await db.organization.upsert({
    where: { id: 1 },
    create: { id: 1, ...d, currency: d.currency.toUpperCase(), businessType: d.businessType || null },
    update: { ...d, currency: d.currency.toUpperCase(), businessType: d.businessType || null },
  });
  return { success: true };
}

const whStepSchema = z.object({
  code: z.string().min(1, "Code is required").max(16),
  name: z.string().min(1, "Name is required").max(120),
  address: z.string().max(300).optional().or(z.literal("")),
});

/** Step 2: first warehouse (skipped if one exists) */
export async function onboardingWarehouse(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const parsed = whStepSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const dup = await db.warehouse.findUnique({ where: { code: d.code } });
  if (dup) return { error: `Warehouse code "${d.code}" already exists` };
  await db.warehouse.create({
    data: { code: d.code, name: d.name, address: d.address || null, isPrimary: (await db.warehouse.count()) === 0 },
  });
  return { success: true };
}

const firstItemSchema = z.object({
  name: z.string().min(1, "Item name is required").max(200),
  sku: z.string().min(1, "SKU is required").max(64),
  sellingPrice: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0).default(0),
  openingStock: z.coerce.number().int().min(0).default(0),
});

/** Step 3 option A: add the first product manually (with opening stock) */
export async function onboardingFirstItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSession();
  const parsed = firstItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const dup = await db.product.findUnique({ where: { sku: d.sku } });
  if (dup) return { error: `SKU "${d.sku}" already exists` };
  const wh = await db.warehouse.findFirst({ orderBy: { isPrimary: "desc" } });
  if (!wh) return { error: "Create a warehouse first" };

  await db.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: { name: d.name, sku: d.sku, sellingPrice: d.sellingPrice, costPrice: d.costPrice },
    });
    if (d.openingStock > 0) {
      await tx.stockLevel.create({
        data: { productId: product.id, warehouseId: wh.id, quantity: d.openingStock },
      });
      await tx.stockMovement.create({
        data: {
          type: "ADJUSTMENT", productId: product.id, warehouseId: wh.id,
          quantity: d.openingStock, reference: "OPENING-STOCK", userId: user.id,
        },
      });
    }
  });
  return { success: true };
}

/**
 * Step 3 option B: CSV import.
 * Expected header: name,sku,category,costPrice,sellingPrice,openingStock
 */
export async function onboardingImportCsv(csvText: string): Promise<{ error?: string; imported?: number }> {
  const user = await requireSession();
  const wh = await db.warehouse.findFirst({ orderBy: { isPrimary: "desc" } });
  if (!wh) return { error: "Create a warehouse first" };

  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { error: "CSV needs a header row and at least one data row" };
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const idx = (k: string) => header.indexOf(k);
  if (idx("name") === -1 || idx("sku") === -1) return { error: "CSV header must include name and sku columns" };

  let imported = 0;
  const errors: string[] = [];
  for (const line of lines.slice(1).slice(0, 500)) {
    const cols = line.split(",").map((c) => c.trim());
    const name = cols[idx("name")];
    const sku = cols[idx("sku")];
    if (!name || !sku) continue;
    const categoryName = idx("category") >= 0 ? cols[idx("category")] : "";
    const costPrice = idx("costprice") >= 0 ? Number(cols[idx("costprice")]) || 0 : 0;
    const sellingPrice = idx("sellingprice") >= 0 ? Number(cols[idx("sellingprice")]) || 0 : 0;
    const openingStock = idx("openingstock") >= 0 ? Math.max(0, Math.floor(Number(cols[idx("openingstock")]) || 0)) : 0;

    const dup = await db.product.findUnique({ where: { sku } });
    if (dup) { errors.push(`${sku}: duplicate`); continue; }

    let categoryId: string | null = null;
    if (categoryName) {
      const cat = await db.category.upsert({ where: { name: categoryName }, create: { name: categoryName }, update: {} });
      categoryId = cat.id;
    }
    await db.$transaction(async (tx) => {
      const product = await tx.product.create({ data: { name, sku, categoryId, costPrice, sellingPrice } });
      if (openingStock > 0) {
        await tx.stockLevel.create({ data: { productId: product.id, warehouseId: wh.id, quantity: openingStock } });
        await tx.stockMovement.create({
          data: {
            type: "ADJUSTMENT", productId: product.id, warehouseId: wh.id,
            quantity: openingStock, reference: "CSV-IMPORT", userId: user.id,
          },
        });
      }
    });
    imported++;
  }
  await logActivity(user.id, "imported items from CSV", "Product", undefined, `${imported} item(s)`);
  if (imported === 0) return { error: errors.length ? `Nothing imported (${errors.slice(0, 3).join("; ")})` : "Nothing imported" };
  return { imported };
}

/** Step 3 option C: load full demo dataset by running the seed logic inline is heavy;
 *  instead mark setup done and tell the user demo data is already present (seeded DBs)
 *  or leave empty states to guide them. Kept simple: this just completes setup. */
export async function completeOnboarding(): Promise<never> {
  const user = await requireSession();
  await db.organization.updateMany({ data: { onboarded: true } });
  await db.user.update({ where: { id: user.id }, data: { onboarded: true } });
  await logActivity(user.id, "completed onboarding", "Organization", "1");
  redirect("/dashboard");
}
