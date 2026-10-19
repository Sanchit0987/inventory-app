"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createProduct, updateProduct } from "@/actions/products";
import { Button, ErrorText, Field, Modal, inputCls } from "@/components/ui";

export type ProductRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  emoji: string | null;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  costPrice: number;
  sellingPrice: number;
  taxRatePct: number;
  unit: string;
  reorderPoint: number;
  isActive: boolean;
  totalStock: number;
  warehouseNames: string[];
  warehouseIds: string[];
  variants: { name: string; sku: string; extraPrice: number }[];
};

const EMOJI_CHOICES = ["📦", "🎧", "🎵", "🔊", "🎙️", "🔌", "📺", "🧩", "⚡", "🔋", "📱", "🚗", "⌨️", "🖱️", "📷", "💻", "🏠", "💡", "📹", "🚪", "💾", "🗂️", "📀", "🖥️"];

export default function ProductFormModal({
  categories,
  suppliers,
  warehouses,
  units,
  product,
  onClose,
}: {
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; code: string; name: string }[];
  units: string[];
  product: ProductRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const action = product ? updateProduct.bind(null, product.id) : createProduct;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [emoji, setEmoji] = useState(product?.emoji ?? "📦");
  const [variants, setVariants] = useState(product?.variants ?? []);

  useEffect(() => {
    if (state?.success) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  return (
    <Modal title={product ? `Edit ${product.name}` : "New item"} onClose={onClose} wide>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="imageEmoji" value={emoji} />
        <input type="hidden" name="variants" value={JSON.stringify(variants)} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <input name="name" required defaultValue={product?.name} placeholder="Wireless Headphones" className={inputCls} />
          </Field>
          <Field label="SKU">
            <input name="sku" required defaultValue={product?.sku} placeholder="AUD-WH100" className={inputCls} />
          </Field>
          <Field label="Barcode (optional)">
            <input name="barcode" defaultValue={product?.barcode ?? ""} placeholder="810001001" className={inputCls} />
          </Field>
          <Field label="Category">
            <select name="categoryId" defaultValue={product?.categoryId ?? ""} className={inputCls}>
              <option value="">Uncategorized</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Unit">
            <select name="unit" defaultValue={product?.unit ?? units[0] ?? "pcs"} className={inputCls}>
              {[...new Set([...(product?.unit ? [product.unit] : []), ...units])].map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </Field>
          <Field label="Preferred supplier">
            <select name="supplierId" defaultValue={product?.supplierId ?? ""} className={inputCls}>
              <option value="">None</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Cost price">
            <input name="costPrice" type="number" step="0.01" min="0" required defaultValue={product?.costPrice ?? ""} className={inputCls} />
          </Field>
          <Field label="Selling price">
            <input name="sellingPrice" type="number" step="0.01" min="0" required defaultValue={product?.sellingPrice ?? ""} className={inputCls} />
          </Field>
          <Field label="Tax rate %">
            <input name="taxRatePct" type="number" step="0.01" min="0" max="100" defaultValue={product?.taxRatePct ?? 0} className={inputCls} />
          </Field>
          <Field label="Minimum stock (reorder point)">
            <input name="reorderPoint" type="number" min="0" defaultValue={product?.reorderPoint ?? 0} className={inputCls} />
          </Field>
          {!product && (
            <>
              <Field label="Opening stock">
                <input name="openingStock" type="number" min="0" defaultValue={0} className={inputCls} />
              </Field>
              <Field label="Opening stock warehouse">
                <select name="openingWarehouseId" defaultValue={warehouses[0]?.id ?? ""} className={inputCls}>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
            </>
          )}
          <Field label="Description" className="sm:col-span-2">
            <textarea name="description" rows={2} defaultValue={product?.description ?? ""} className={inputCls} />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-gray-600">Image</span>
          <div className="flex flex-wrap gap-1">
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg cursor-pointer ${emoji === e ? "bg-brand-100 ring-2 ring-brand-500" : "bg-gray-50 hover:bg-gray-100"}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">Variants</span>
            <button
              type="button"
              onClick={() => setVariants([...variants, { name: "", sku: "", extraPrice: 0 }])}
              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer"
            >
              <Plus size={13} /> Add variant
            </button>
          </div>
          {variants.length === 0 ? (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-400">No variants — this is a simple product.</p>
          ) : (
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={v.name}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    placeholder="Variant (e.g. Black / Large)"
                    className={inputCls}
                  />
                  <input
                    value={v.sku}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))}
                    placeholder="Variant SKU"
                    className={inputCls}
                  />
                  <input
                    value={v.extraPrice}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, extraPrice: Number(e.target.value) || 0 } : x)))}
                    type="number"
                    step="0.01"
                    placeholder="+ price"
                    className={`${inputCls} w-28`}
                  />
                  <button type="button" onClick={() => setVariants(variants.filter((_, j) => j !== i))} className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <ErrorText>{state?.error}</ErrorText>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 size={15} className="animate-spin" />}
            {product ? "Save changes" : "Create item"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
