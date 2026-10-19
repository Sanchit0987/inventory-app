"use client";

import {
  Archive, ArchiveRestore, ArrowUpDown, ChevronDown, Download, Package,
  PackagePlus, Pencil, Search, Trash2, Upload, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { onboardingImportCsv } from "@/actions/onboarding";
import { deleteProducts, inlineUpdateProduct, setProductsActive } from "@/actions/products";
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Pagination,
  cls, usePagination, useToast,
} from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import ProductFormModal, { type ProductRow } from "./product-form";

type Category = { id: string; name: string };
type SortKey = "name" | "sku" | "totalStock" | "sellingPrice";

export default function ItemsClient({
  products, categories, suppliers, warehouses, currencySymbol, units,
}: {
  products: ProductRow[];
  categories: Category[];
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; code: string; name: string }[];
  currencySymbol: string;
  units: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out" | "ok">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(() => Boolean(params.get("new")));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const whFilter = params.get("wh"); // topbar warehouse selector

  useEffect(() => {
    if (params.get("new")) router.replace("/items");
  }, [params, router]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = products.filter((p) => {
      if (!showArchived && !p.isActive) return false;
      if (whFilter && !p.warehouseIds.includes(whFilter)) return false;
      if (cat !== "all" && p.categoryId !== cat) return false;
      if (stockFilter === "low" && !(p.totalStock > 0 && p.totalStock <= p.reorderPoint)) return false;
      if (stockFilter === "out" && p.totalStock !== 0) return false;
      if (stockFilter === "ok" && p.totalStock <= p.reorderPoint) return false;
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        p.sku.toLowerCase().includes(needle) ||
        (p.barcode ?? "").toLowerCase().includes(needle) ||
        (p.categoryName ?? "").toLowerCase().includes(needle)
      );
    });
    return rows.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      const cmp = typeof va === "string" ? va.localeCompare(String(vb)) : Number(va) - Number(vb);
      return cmp * sortDir;
    });
  }, [products, q, cat, stockFilter, showArchived, sortKey, sortDir, whFilter]);

  const { rows: pageRows, page, pages, total, setPage } = usePagination(filtered, 25);

  const sort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  };

  const allSelected = pageRows.length > 0 && pageRows.every((p) => selected.has(p.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(pageRows.map((p) => p.id)));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const runBulk = (fn: () => Promise<{ error?: string } | undefined>, okMsg: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res?.error) toast("error", res.error);
      else { toast("success", okMsg); setSelected(new Set()); router.refresh(); }
    });

  /* CSV export of the filtered rows */
  const exportCsv = () => {
    const header = "name,sku,barcode,category,warehouses,costPrice,sellingPrice,stock,reorderPoint,status";
    const lines = filtered.map((p) =>
      [
        `"${p.name.replace(/"/g, '""')}"`, p.sku, p.barcode ?? "", p.categoryName ?? "",
        p.warehouseNames.join("|"), p.costPrice, p.sellingPrice, p.totalStock, p.reorderPoint,
        !p.isActive ? "archived" : p.totalStock === 0 ? "out-of-stock" : p.totalStock <= p.reorderPoint ? "low-stock" : "in-stock",
      ].join(",")
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "items-export.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("success", `Exported ${filtered.length} item(s) to CSV`);
  };

  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () =>
      startTransition(async () => {
        const res = await onboardingImportCsv(String(reader.result ?? ""));
        if (res.error) toast("error", res.error);
        else { toast("success", `Imported ${res.imported} item(s)`); router.refresh(); }
      });
    reader.readAsText(file);
  };

  const th = (label: string, key?: SortKey, right?: boolean) => (
    <th className={cls("px-2 py-3 font-medium", right && "text-right")}>
      {key ? (
        <button onClick={() => sort(key)} className="inline-flex items-center gap-1 hover:text-gray-700 cursor-pointer">
          {label} <ArrowUpDown size={11} className={sortKey === key ? "text-brand-600" : "opacity-40"} />
        </button>
      ) : label}
    </th>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Items"
        description={`${products.filter((p) => p.isActive).length} active items in your catalog`}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Items" }]}
        actions={
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={pending}>
              <Upload size={15} /> Import
            </Button>
            <Button variant="secondary" onClick={exportCsv}>
              <Download size={15} /> Export
            </Button>
            <Button onClick={() => setCreating(true)}>
              <PackagePlus size={15} /> Add item
            </Button>
          </>
        }
      />

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-52 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, SKU, barcode…"
            className="w-full rounded-lg bg-gray-100 py-2 pl-9 pr-3 text-sm outline-none ring-brand-500 focus:bg-white focus:ring-2"
          />
        </div>
        <FilterSelect value={cat} onChange={setCat}
          options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
        <FilterSelect value={stockFilter} onChange={(v) => setStockFilter(v as typeof stockFilter)}
          options={[
            { value: "all", label: "All stock levels" },
            { value: "ok", label: "In stock" },
            { value: "low", label: "Low stock" },
            { value: "out", label: "Out of stock" },
          ]} />
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-brand-600" />
          Archived
        </label>
      </Card>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white shadow-lg animate-slide-up" style={{ background: "#10162a" }}>
          <span className="font-medium">{selected.size} selected</span>
          <div className="mx-2 h-4 w-px bg-white/20" />
          <button disabled={pending} onClick={() => runBulk(() => setProductsActive([...selected], false), "Items archived")}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 hover:bg-white/10 cursor-pointer">
            <Archive size={14} /> Archive
          </button>
          <button disabled={pending} onClick={() => runBulk(() => setProductsActive([...selected], true), "Items restored")}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 hover:bg-white/10 cursor-pointer">
            <ArchiveRestore size={14} /> Restore
          </button>
          <button disabled={pending} onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-red-300 hover:bg-white/10 cursor-pointer">
            <Trash2 size={14} /> Delete
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto rounded-lg p-1 hover:bg-white/10 cursor-pointer"><X size={15} /></button>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        {pageRows.length === 0 ? (
          <EmptyState
            icon={<Package size={28} />}
            title={q || cat !== "all" || stockFilter !== "all" ? "No items match your filters" : "No items yet"}
            hint={q ? "Try a different search term or clear the filters." : "Add your first item or import a CSV to start tracking stock."}
            action={<Button onClick={() => setCreating(true)}><PackagePlus size={15} /> Add item</Button>}
          />
        ) : (
          <>
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="w-10 px-4 py-3"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-brand-600" /></th>
                    {th("Item", "name")}
                    {th("SKU", "sku")}
                    <th className="px-2 py-3 font-medium">Category</th>
                    <th className="px-2 py-3 font-medium">Warehouses</th>
                    {th("Qty", "totalStock", true)}
                    {th("Price", "sellingPrice", true)}
                    <th className="px-2 py-3 font-medium">Status</th>
                    <th className="w-12 px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageRows.map((p) => (
                    <tr key={p.id} className={cls("group hover:bg-gray-50/70", !p.isActive && "opacity-50")}>
                      <td className="px-4 py-2.5"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="accent-brand-600" /></td>
                      <td className="px-2 py-2.5">
                        <Link href={`/items/${p.id}`} className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-base">{p.emoji ?? "📦"}</span>
                          <span>
                            <span className="block font-medium text-gray-900 group-hover:text-brand-600">{p.name}</span>
                            {p.variants.length > 0 && <span className="text-xs text-gray-400">{p.variants.length} variants</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 font-mono text-xs text-gray-500">{p.sku}</td>
                      <td className="px-2 py-2.5 text-gray-500">{p.categoryName ?? "—"}</td>
                      <td className="px-2 py-2.5">
                        <span className="flex flex-wrap gap-1">
                          {p.warehouseNames.length === 0
                            ? <span className="text-xs text-gray-300">—</span>
                            : p.warehouseNames.map((w) => (
                              <span key={w} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500">{w}</span>
                            ))}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-medium tabular-nums">{p.totalStock}</td>
                      <td className="px-2 py-2.5 text-right font-medium">
                        <InlineNumber value={p.sellingPrice} prefix={currencySymbol} onSave={(v) => inlineUpdateProduct(p.id, "sellingPrice", v)} />
                      </td>
                      <td className="px-2 py-2.5">
                        {!p.isActive ? <Badge color="gray">archived</Badge>
                          : p.totalStock === 0 ? <Badge color="red">out of stock</Badge>
                          : p.totalStock <= p.reorderPoint ? <Badge color="amber">low stock</Badge>
                          : <Badge color="green">in stock</Badge>}
                      </td>
                      <td className="px-2 py-2.5">
                        <button onClick={() => setEditing(p)} title="Edit" className="rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-600 group-hover:text-gray-400 cursor-pointer">
                          <Pencil size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pages={pages} total={total} onPage={setPage} />
          </>
        )}
      </Card>

      {(creating || editing) && (
        <ProductFormModal
          categories={categories}
          suppliers={suppliers}
          warehouses={warehouses}
          units={units}
          product={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${selected.size} item(s)?`}
          message="Items used on orders cannot be deleted and should be archived instead. This cannot be undone."
          onConfirm={() => runBulk(() => deleteProducts([...selected]), "Items deleted")}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function FilterSelect({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg bg-gray-100 py-2 pl-3 pr-8 text-sm outline-none ring-brand-500 focus:bg-white focus:ring-2 cursor-pointer"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
    </div>
  );
}

function InlineNumber({
  value, onSave, prefix, integer,
}: { value: number; onSave: (v: number) => Promise<{ error?: string } | undefined>; prefix?: string; integer?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        title="Click to edit"
        className="rounded px-1 py-0.5 tabular-nums hover:bg-brand-50 hover:text-brand-700 cursor-pointer"
      >
        {prefix ? fmtMoney(value, prefix) : value}
      </button>
    );
  }
  const commit = () => {
    const num = Number(draft);
    setEditing(false);
    if (Number.isNaN(num) || num === value) return;
    startTransition(async () => {
      const res = await onSave(integer ? Math.round(num) : num);
      if (res?.error) toast("error", res.error);
      else toast("success", "Saved");
      router.refresh();
    });
  };
  return (
    <input
      autoFocus
      value={draft}
      disabled={pending}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-20 rounded border border-brand-300 px-1 py-0.5 text-right text-sm outline-none ring-2 ring-brand-200"
    />
  );
}
