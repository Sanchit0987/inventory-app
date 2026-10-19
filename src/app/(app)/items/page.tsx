import { db } from "@/lib/db";
import ItemsClient from "./items-client";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const [products, categories, suppliers, warehouses, org] = await Promise.all([
    db.product.findMany({
      include: { category: true, stockLevels: { include: { warehouse: true } }, variants: true, supplier: true },
      orderBy: { name: "asc" },
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.warehouse.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    db.organization.findUnique({ where: { id: 1 } }),
  ]);

  const rows = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    emoji: p.imageEmoji,
    description: p.description,
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? null,
    supplierId: p.supplierId,
    supplierName: p.supplier?.name ?? null,
    costPrice: p.costPrice,
    sellingPrice: p.sellingPrice,
    taxRatePct: p.taxRatePct,
    unit: p.unit,
    reorderPoint: p.reorderPoint,
    isActive: p.isActive,
    totalStock: p.stockLevels.reduce((s, l) => s + l.quantity, 0),
    warehouseNames: [...new Set(p.stockLevels.filter((l) => l.quantity > 0).map((l) => l.warehouse.code))],
    warehouseIds: p.stockLevels.filter((l) => l.quantity > 0).map((l) => l.warehouseId),
    variants: p.variants.map((v) => ({ name: v.name, sku: v.sku, extraPrice: v.extraPrice })),
  }));

  return (
    <ItemsClient
      products={rows}
      categories={categories}
      suppliers={suppliers}
      warehouses={warehouses}
      currencySymbol={org?.currencySymbol ?? "$"}
      units={org?.units ?? ["pcs", "box", "kg"]}
    />
  );
}
