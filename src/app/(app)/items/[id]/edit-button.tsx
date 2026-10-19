"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import ProductFormModal, { type ProductRow } from "../product-form";

/* Edit control on the item detail page — reuses the items form modal */
export default function EditItemButton({
  product, categories, suppliers, warehouses, units,
}: {
  product: ProductRow;
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; code: string; name: string }[];
  units: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Pencil size={15} /> Edit item
      </Button>
      {open && (
        <ProductFormModal
          categories={categories}
          suppliers={suppliers}
          warehouses={warehouses}
          units={units}
          product={product}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
