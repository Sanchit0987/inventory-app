import { ArrowLeft, Barcode, Boxes, Tag } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Breadcrumbs, Card, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import EditItemButton from "./edit-button";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, org, categories, suppliers, warehouses] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: {
        category: true,
        supplier: true,
        variants: true,
        stockLevels: { include: { warehouse: true } },
        movements: { orderBy: { createdAt: "desc" }, take: 25, include: { warehouse: true, user: true } },
      },
    }),
    db.organization.findUnique({ where: { id: 1 } }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.warehouse.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  if (!product) notFound();
  const sym = org?.currencySymbol ?? "$";
  const total = product.stockLevels.reduce((s, l) => s + l.quantity, 0);

  const formRow = {
    id: product.id,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    emoji: product.imageEmoji,
    description: product.description,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    supplierId: product.supplierId,
    supplierName: product.supplier?.name ?? null,
    costPrice: product.costPrice,
    sellingPrice: product.sellingPrice,
    taxRatePct: product.taxRatePct,
    unit: product.unit,
    reorderPoint: product.reorderPoint,
    isActive: product.isActive,
    totalStock: total,
    warehouseNames: [] as string[],
    warehouseIds: [] as string[],
    variants: product.variants.map((v) => ({ name: v.name, sku: v.sku, extraPrice: v.extraPrice })),
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/items" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} /> Back to items
        </Link>
        <Breadcrumbs items={[{ label: "Home", href: "/dashboard" }, { label: "Items", href: "/items" }, { label: product.name }]} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm ring-1 ring-gray-900/5">
            {product.imageEmoji ?? "📦"}
          </span>
          <div>
            <h1 className="text-xl font-bold">{product.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span className="flex items-center gap-1 font-mono text-xs"><Tag size={13} /> {product.sku}</span>
              {product.barcode && <span className="flex items-center gap-1 font-mono text-xs"><Barcode size={13} /> {product.barcode}</span>}
              {product.category && <Badge color="blue">{product.category.name}</Badge>}
              {product.supplier && (
                <Link href={`/contacts/supplier/${product.supplier.id}`}>
                  <Badge color="amber">from {product.supplier.name}</Badge>
                </Link>
              )}
              {!product.isActive && <Badge color="gray">archived</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-6 text-right">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">On hand</p>
            <p className="text-2xl font-bold tabular-nums">{total} <span className="text-sm font-normal text-gray-400">{product.unit}</span></p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Price</p>
            <p className="text-2xl font-bold">{fmtMoney(product.sellingPrice, sym)}</p>
            <p className="text-xs text-gray-400">cost {fmtMoney(product.costPrice, sym)}</p>
          </div>
          <EditItemButton product={formRow} categories={categories} suppliers={suppliers}
            warehouses={warehouses} units={org?.units ?? ["pcs"]} />
        </div>
      </div>

      {product.description && <p className="max-w-2xl text-sm text-gray-600">{product.description}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Boxes size={15} /> Stock by warehouse</h2>
          {product.stockLevels.length === 0 ? (
            <p className="text-sm text-gray-400">No stock recorded yet.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {product.stockLevels.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="font-medium">{l.warehouse.name}</span>
                    {l.binLocation && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-500">{l.binLocation}</span>}
                  </span>
                  <span className="font-semibold tabular-nums">{l.quantity}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 border-t border-gray-100 pt-2 text-sm text-gray-500">
            Reorder point: <span className="font-medium text-gray-800">{product.reorderPoint}</span>
          </div>

          {product.variants.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-sm font-semibold">Variants</h3>
              <ul className="divide-y divide-gray-50">
                {product.variants.map((v) => (
                  <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{v.name} <span className="ml-1 font-mono text-[11px] text-gray-400">{v.sku}</span></span>
                    <span className="text-gray-500">{v.extraPrice > 0 ? `+${fmtMoney(v.extraPrice, sym)}` : "—"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Movement history</h2>
          {product.movements.length === 0 ? (
            <p className="text-sm text-gray-400">No movements recorded.</p>
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Warehouse</th>
                    <th className="py-2 pr-3 text-right font-medium">Qty</th>
                    <th className="py-2 pr-3 font-medium">Ref</th>
                    <th className="py-2 font-medium">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {product.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 pr-3 text-gray-500">{fmtDateTime(m.createdAt)}</td>
                      <td className="py-2 pr-3"><StatusBadge status={m.type} /></td>
                      <td className="py-2 pr-3 text-gray-500">{m.warehouse.name}</td>
                      <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${m.quantity > 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {m.quantity > 0 ? "+" : ""}{m.quantity}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-gray-500">{m.reference ?? "—"}</td>
                      <td className="py-2 text-gray-500">{m.user?.name ?? "System"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
