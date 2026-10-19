"use client";

import {
  ArrowLeftRight, Boxes, History, Loader2, MapPin,
  PackageSearch, Plus, ScanLine, Search, SlidersHorizontal, Trash2,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { adjustStock, createTransfer, createWarehouse, scanLookup, setBinLocation } from "@/actions/inventory";
import {
  Badge, Button, Card, EmptyState, ErrorText, Field, Modal, PageHeader,
  Pagination, StatusBadge, TabStrip, cls, inputCls, usePagination, useToast,
} from "@/components/ui";
import { fmtDateTime, fmtMoney } from "@/lib/format";

type Level = {
  id: string; productId: string; productName: string; sku: string; emoji: string | null;
  category: string | null; unit: string; reorderPoint: number;
  warehouseId: string; warehouseName: string; quantity: number;
  reserved: number; incoming: number; binLocation: string | null;
};
type Wh = {
  id: string; code: string; name: string; address: string | null; isPrimary: boolean;
  skuCount: number; totalUnits: number; totalValue: number;
};
type ProductOpt = { id: string; name: string; sku: string; imageEmoji: string | null };
type Movement = {
  id: string; type: string; productName: string; sku: string; warehouseName: string;
  quantity: number; reference: string | null; note: string | null; userName: string | null; createdAt: string;
};
type Transfer = {
  id: string; number: string; from: string; to: string; status: string;
  lineCount: number; totalQty: number; createdAt: string;
};

type Tab = "stock" | "warehouses" | "transfers" | "adjustments" | "movements";
const TABS: Tab[] = ["stock", "warehouses", "transfers", "adjustments", "movements"];

export default function InventoryClient({
  levels, warehouses, products, movements, transfers,
}: {
  levels: Level[]; warehouses: Wh[]; products: ProductOpt[]; movements: Movement[]; transfers: Transfer[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const urlTab = params.get("tab") as Tab | null;
  // tab derives from the URL so sidebar submenu links work without state syncing
  const tab: Tab = urlTab && TABS.includes(urlTab) ? urlTab : "stock";
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(params.get("filter") === "low");
  const [adjusting, setAdjusting] = useState<Level | null>(null);
  const [transferClosed, setTransferClosed] = useState(false);
  const [scanClosed, setScanClosed] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [creatingWh, setCreatingWh] = useState(false);
  const whFilter = params.get("wh"); // topbar selector
  // deep links (?new=transfer / ?scan=1) open modals until explicitly closed
  const transferring = transferOpen || (params.get("new") === "transfer" && !transferClosed);
  const scanning = scanOpen || (Boolean(params.get("scan")) && !scanClosed);
  const closeTransfer = () => { setTransferOpen(false); setTransferClosed(true); };
  const closeScan = () => { setScanOpen(false); setScanClosed(true); };

  const setTab = (t: Tab) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", t);
    sp.delete("new"); sp.delete("scan");
    setTransferClosed(false); setScanClosed(false);
    router.replace(`/inventory?${sp.toString()}`);
  };

  const filteredLevels = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return levels.filter((l) => {
      if (whFilter && l.warehouseId !== whFilter) return false;
      if (onlyLow && l.quantity > l.reorderPoint) return false;
      if (!needle) return true;
      return (
        l.productName.toLowerCase().includes(needle) ||
        l.sku.toLowerCase().includes(needle) ||
        (l.binLocation ?? "").toLowerCase().includes(needle)
      );
    });
  }, [levels, q, onlyLow, whFilter]);

  const stockPager = usePagination(filteredLevels, 25);

  const adjustments = useMemo(() => movements.filter((m) => m.type === "ADJUSTMENT"), [movements]);
  const movementsPager = usePagination(movements, 25);
  const adjustmentsPager = usePagination(adjustments, 25);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory"
        description={`Real-time stock across ${warehouses.length} warehouse(s)`}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Inventory" }]}
        actions={
          <>
            <Button variant="secondary" onClick={() => setScanOpen(true)}><ScanLine size={15} /> Scan code</Button>
            <Button onClick={() => setTransferOpen(true)}><ArrowLeftRight size={15} /> New transfer</Button>
          </>
        }
      />

      <TabStrip
        tabs={[
          { id: "stock" as Tab, label: "Stock overview", icon: Boxes },
          { id: "warehouses" as Tab, label: "Warehouses", icon: WarehouseIcon },
          { id: "transfers" as Tab, label: "Stock transfers", icon: ArrowLeftRight },
          { id: "adjustments" as Tab, label: "Adjustments", icon: SlidersHorizontal },
          { id: "movements" as Tab, label: "Movement history", icon: History },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "stock" && (
        <>
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <div className="relative min-w-52 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product, SKU, bin…"
                className="w-full rounded-lg bg-gray-100 py-2 pl-9 pr-3 text-sm outline-none ring-brand-500 focus:bg-white focus:ring-2" />
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="accent-brand-600" />
              At/below reorder point
            </label>
            {whFilter && (
              <Badge color="blue">filtered: {warehouses.find((w) => w.id === whFilter)?.name ?? "warehouse"}</Badge>
            )}
          </Card>

          <Card className="overflow-hidden">
            {stockPager.rows.length === 0 ? (
              <EmptyState icon={<PackageSearch size={28} />} title="No stock entries match"
                hint="Adjust the filters, or receive a purchase order to add stock." />
            ) : (
              <>
                <div className="scroll-thin overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                        <th className="px-4 py-3 font-medium">Product</th>
                        <th className="px-2 py-3 font-medium">Warehouse</th>
                        <th className="px-2 py-3 font-medium">Bin</th>
                        <th className="px-2 py-3 text-right font-medium">On hand</th>
                        <th className="px-2 py-3 text-right font-medium">Reserved</th>
                        <th className="px-2 py-3 text-right font-medium">Available</th>
                        <th className="px-2 py-3 text-right font-medium">Incoming</th>
                        <th className="px-2 py-3 font-medium">Status</th>
                        <th className="px-2 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {stockPager.rows.map((l) => {
                        const available = l.quantity - l.reserved;
                        return (
                          <tr key={l.id} className="hover:bg-gray-50/70">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-base">{l.emoji ?? "📦"}</span>
                                <div>
                                  <p className="font-medium">{l.productName}</p>
                                  <p className="font-mono text-xs text-gray-400">{l.sku}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-gray-600">{l.warehouseName}</td>
                            <td className="px-2 py-2.5"><BinEditor levelId={l.id} bin={l.binLocation} /></td>
                            <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{l.quantity}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-gray-500">{l.reserved || "—"}</td>
                            <td className={cls("px-2 py-2.5 text-right font-medium tabular-nums", available < 0 && "text-red-600")}>{available}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-gray-500">{l.incoming ? `+${l.incoming}` : "—"}</td>
                            <td className="px-2 py-2.5">
                              {l.quantity === 0 ? <Badge color="red">empty</Badge>
                                : l.quantity <= l.reorderPoint ? <Badge color="amber">low</Badge>
                                : <Badge color="green">ok</Badge>}
                            </td>
                            <td className="px-2 py-2.5 text-right">
                              <button onClick={() => setAdjusting(l)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 cursor-pointer">
                                <SlidersHorizontal size={13} /> Adjust
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination page={stockPager.page} pages={stockPager.pages} total={stockPager.total} onPage={stockPager.setPage} />
              </>
            )}
          </Card>
        </>
      )}

      {tab === "warehouses" && (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setCreatingWh(true)}><Plus size={15} /> New warehouse</Button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {warehouses.map((w) => (
              <Card key={w.id} className="p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <WarehouseIcon size={18} />
                  </div>
                  <div>
                    <p className="font-semibold">{w.name} {w.isPrimary && <Badge color="blue">primary</Badge>}</p>
                    <p className="font-mono text-xs text-gray-400">{w.code}</p>
                  </div>
                </div>
                {w.address && <p className="mt-2 flex items-center gap-1 text-xs text-gray-500"><MapPin size={12} /> {w.address}</p>}
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-center">
                  <div><p className="text-lg font-bold tabular-nums">{w.skuCount}</p><p className="text-[11px] uppercase text-gray-400">SKUs</p></div>
                  <div><p className="text-lg font-bold tabular-nums">{w.totalUnits.toLocaleString()}</p><p className="text-[11px] uppercase text-gray-400">Units</p></div>
                  <div><p className="text-lg font-bold">{fmtMoney(w.totalValue)}</p><p className="text-[11px] uppercase text-gray-400">Value</p></div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === "transfers" && (
        <Card className="overflow-hidden">
          {transfers.length === 0 ? (
            <EmptyState icon={<ArrowLeftRight size={28} />} title="No transfers yet"
              hint="Move stock between warehouses — both sides are recorded atomically."
              action={<Button onClick={() => setTransferOpen(true)}><Plus size={15} /> New transfer</Button>} />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3 font-medium">Number</th>
                    <th className="px-2 py-3 font-medium">Route</th>
                    <th className="px-2 py-3 text-right font-medium">Lines</th>
                    <th className="px-2 py-3 text-right font-medium">Units</th>
                    <th className="px-2 py-3 font-medium">Status</th>
                    <th className="px-2 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50/70">
                      <td className="px-4 py-2.5 font-mono text-xs font-medium">{t.number}</td>
                      <td className="px-2 py-2.5">{t.from} <span className="text-gray-400">→</span> {t.to}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{t.lineCount}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{t.totalQty}</td>
                      <td className="px-2 py-2.5"><StatusBadge status={t.status} /></td>
                      <td className="px-2 py-2.5 text-gray-500">{fmtDateTime(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "adjustments" && (
        <Card className="overflow-hidden">
          {adjustmentsPager.rows.length === 0 ? (
            <EmptyState icon={<SlidersHorizontal size={28} />} title="No adjustments recorded"
              hint="Adjust stock from the Stock overview tab — every change keeps an audited reason." />
          ) : (
            <>
              <MovementTable rows={adjustmentsPager.rows} showNote />
              <Pagination page={adjustmentsPager.page} pages={adjustmentsPager.pages} total={adjustmentsPager.total} onPage={adjustmentsPager.setPage} />
            </>
          )}
        </Card>
      )}

      {tab === "movements" && (
        <Card className="overflow-hidden">
          <MovementTable rows={movementsPager.rows} />
          <Pagination page={movementsPager.page} pages={movementsPager.pages} total={movementsPager.total} onPage={movementsPager.setPage} />
        </Card>
      )}

      {adjusting && <AdjustModal level={adjusting} warehouses={warehouses} onClose={() => setAdjusting(null)} />}
      {transferring && <TransferModal warehouses={warehouses} products={products} onClose={closeTransfer} />}
      {scanning && <ScanModal onClose={closeScan} />}
      {creatingWh && <WarehouseModal onClose={() => setCreatingWh(false)} />}
    </div>
  );
}

function MovementTable({ rows, showNote }: { rows: Movement[]; showNote?: boolean }) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="px-4 py-3 font-medium">When</th>
            <th className="px-2 py-3 font-medium">Type</th>
            <th className="px-2 py-3 font-medium">Product</th>
            <th className="px-2 py-3 font-medium">Warehouse</th>
            <th className="px-2 py-3 text-right font-medium">Qty</th>
            <th className="px-2 py-3 font-medium">{showNote ? "Reason" : "Reference"}</th>
            <th className="px-2 py-3 font-medium">By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((m) => (
            <tr key={m.id} className="hover:bg-gray-50/70">
              <td className="px-4 py-2.5 text-gray-500">{fmtDateTime(m.createdAt)}</td>
              <td className="px-2 py-2.5"><StatusBadge status={m.type} /></td>
              <td className="px-2 py-2.5">
                <p className="font-medium">{m.productName}</p>
                <p className="font-mono text-xs text-gray-400">{m.sku}</p>
              </td>
              <td className="px-2 py-2.5 text-gray-600">{m.warehouseName}</td>
              <td className={cls("px-2 py-2.5 text-right font-semibold tabular-nums", m.quantity > 0 ? "text-emerald-600" : "text-red-600")}>
                {m.quantity > 0 ? "+" : ""}{m.quantity}
              </td>
              <td className="px-2 py-2.5 text-xs text-gray-500">{showNote ? (m.note ?? m.reference ?? "—") : (m.reference ?? "—")}</td>
              <td className="px-2 py-2.5 text-gray-500">{m.userName ?? "System"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BinEditor({ levelId, bin }: { levelId: string; bin: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bin ?? "");
  const [, startTransition] = useTransition();

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} title="Click to edit bin"
        className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-500 hover:bg-brand-50 hover:text-brand-700 cursor-pointer">
        {bin ?? "— set bin —"}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    if (draft === (bin ?? "")) return;
    const fd = new FormData();
    fd.set("stockLevelId", levelId);
    fd.set("binLocation", draft);
    startTransition(async () => {
      await setBinLocation(undefined, fd);
      router.refresh();
    });
  };
  return (
    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-20 rounded border border-brand-300 px-1 py-0.5 font-mono text-xs outline-none ring-2 ring-brand-200" />
  );
}

function AdjustModal({ level, warehouses, onClose }: { level: Level; warehouses: Wh[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(adjustStock, undefined);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (state?.success) { toast("success", "Stock adjusted"); onClose(); router.refresh(); }
  }, [state, onClose, router, toast]);

  return (
    <Modal title={`Adjust stock — ${level.productName}`} onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="productId" value={level.productId} />
        <input type="hidden" name="warehouseId" value={level.warehouseId} />
        <input type="hidden" name="delta" value={mode === "add" ? amount : `-${amount}`} />

        <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {warehouses.find((w) => w.id === level.warehouseId)?.name} currently has{" "}
          <span className="font-semibold">{level.quantity} {level.unit}</span>.
        </p>

        <div className="flex gap-2">
          {(["add", "remove"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={cls("flex-1 rounded-lg py-2 text-sm font-medium ring-1 ring-inset cursor-pointer",
                mode === m ? "bg-brand-50 text-brand-700 ring-brand-300" : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50")}>
              {m === "add" ? "+ Add stock" : "− Remove stock"}
            </button>
          ))}
        </div>

        <Field label="Quantity">
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            required inputMode="numeric" placeholder="0" className={inputCls} />
        </Field>
        <Field label="Reason / note">
          <input name="note" placeholder="Cycle count, damage, shrinkage…" className={inputCls} />
        </Field>

        <ErrorText>{state?.error}</ErrorText>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending || !amount}>
            {pending && <Loader2 size={15} className="animate-spin" />} Apply adjustment
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TransferModal({ warehouses, products, onClose }: { warehouses: Wh[]; products: ProductOpt[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [lines, setLines] = useState<{ productId: string; quantity: number }[]>([{ productId: "", quantity: 1 }]);
  const boundAction = createTransfer.bind(null, lines.filter((l) => l.productId && l.quantity > 0));
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  useEffect(() => {
    if (state?.success) { toast("success", "Stock transferred"); onClose(); router.refresh(); }
  }, [state, onClose, router, toast]);

  return (
    <Modal title="New stock transfer" onClose={onClose} wide>
      <form action={formAction} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="From warehouse">
            <select name="fromWarehouseId" required className={inputCls} defaultValue="">
              <option value="" disabled>Choose…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="To warehouse">
            <select name="toWarehouseId" required className={inputCls} defaultValue="">
              <option value="" disabled>Choose…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">Lines</span>
            <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: 1 }])}
              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer">
              <Plus size={13} /> Add line
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2">
                <select value={line.productId}
                  onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))}
                  className={inputCls}>
                  <option value="">Choose product…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.imageEmoji ?? ""} {p.name} ({p.sku})</option>)}
                </select>
                <input type="number" min={1} value={line.quantity}
                  onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))}
                  className={`${inputCls} w-24`} />
                <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <Field label="Note (optional)">
          <input name="note" placeholder="Replenishing retail backroom…" className={inputCls} />
        </Field>

        <ErrorText>{state?.error}</ErrorText>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 size={15} className="animate-spin" />} Transfer stock
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function WarehouseModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(createWarehouse, undefined);
  useEffect(() => {
    if (state?.success) { toast("success", "Warehouse created"); onClose(); router.refresh(); }
  }, [state, onClose, router, toast]);
  return (
    <Modal title="New warehouse" onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <Field label="Code (short identifier)"><input name="code" required placeholder="LAX" className={inputCls} /></Field>
        <Field label="Name"><input name="name" required placeholder="Los Angeles Hub" className={inputCls} /></Field>
        <Field label="Address"><input name="address" className={inputCls} /></Field>
        <ErrorText>{state?.error}</ErrorText>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 size={15} className="animate-spin" />} Create warehouse
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ScanModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof scanLookup>> | "none" | null>(null);
  const [pending, startTransition] = useTransition();

  const lookup = () => {
    if (!code.trim()) return;
    startTransition(async () => {
      const r = await scanLookup(code);
      setResult(r ?? "none");
    });
  };

  return (
    <Modal title="Scan barcode / QR" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Scan with a USB/Bluetooth scanner (it types the code and presses Enter), or enter a barcode or SKU manually.
        </p>
        <div className="flex gap-2">
          <input autoFocus value={code} onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="e.g. 810001001 or AUD-WH100" className={`${inputCls} font-mono`} />
          <Button onClick={lookup} disabled={pending || !code.trim()}>
            {pending ? <Loader2 size={15} className="animate-spin" /> : <ScanLine size={15} />} Lookup
          </Button>
        </div>

        {result === "none" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">No product matches “{code}”.</p>
        )}
        {result && result !== "none" && (
          <div className="rounded-xl bg-gray-50 p-4 animate-slide-up">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-sm">{result.emoji ?? "📦"}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{result.name}</p>
                <p className="font-mono text-xs text-gray-400">{result.sku}{result.barcode ? ` · ${result.barcode}` : ""}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold tabular-nums">{result.totalStock}</p>
                <p className="text-[11px] uppercase text-gray-400">{result.unit} total</p>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-gray-200/60 border-t border-gray-200/60">
              {result.levels.map((l, i) => (
                <li key={i} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-600">{l.warehouse}{l.bin && <span className="ml-2 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-gray-500">{l.bin}</span>}</span>
                  <span className="font-medium tabular-nums">{l.qty}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
