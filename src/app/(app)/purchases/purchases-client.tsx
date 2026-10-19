"use client";

import {
  Check, ChevronDown, Loader2, PackageCheck, Plus, Receipt, Search,
  Trash2, Truck, Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { createPurchaseOrder, markBillPaid } from "@/actions/purchases";
import {
  Badge, Button, Card, EmptyState, ErrorText, Field, Modal, PageHeader,
  Pagination, StatusBadge, TabStrip, inputCls, usePagination, useToast,
} from "@/components/ui";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";

type Order = {
  id: string; number: string; supplierName: string; warehouseName: string; status: string;
  isReturn: boolean; billPaid: boolean; orderDate: string; expectedDate: string | null;
  total: number; received: number; ordered: number;
};
type ReceiptRow = {
  id: string; productName: string; sku: string; warehouseName: string;
  quantity: number; reference: string | null; userName: string | null; createdAt: string;
};
type SupplierOpt = { id: string; name: string };
type Wh = { id: string; code: string; name: string };
type ProductOpt = { id: string; name: string; sku: string; imageEmoji: string | null; costPrice: number };

type Tab = "orders" | "received" | "bills" | "returns";
const TABS: Tab[] = ["orders", "received", "bills", "returns"];

export default function PurchasesClient({
  orders, receipts, suppliers, warehouses, products, currencySymbol,
}: {
  orders: Order[]; receipts: ReceiptRow[]; suppliers: SupplierOpt[]; warehouses: Wh[];
  products: ProductOpt[]; currencySymbol: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const urlTab = params.get("tab") as Tab | null;
  // tab derives from the URL so sidebar submenu links work without state syncing
  const tab: Tab = urlTab && TABS.includes(urlTab) ? urlTab : "orders";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [poModal, setPoModal] = useState<false | { isReturn: boolean }>(false);
  const [deepLinkClosed, setDeepLinkClosed] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  // ?new=po deep link opens the create modal until explicitly closed
  const newPo = poModal || (params.get("new") === "po" && !deepLinkClosed ? { isReturn: false } : false);
  const setNewPo = (v: false | { isReturn: boolean }) => {
    if (v === false) setDeepLinkClosed(true);
    setPoModal(v);
  };

  const setTab = (t: Tab) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", t);
    sp.delete("new");
    setDeepLinkClosed(false);
    router.replace(`/purchases?${sp.toString()}`);
  };

  const regularOrders = useMemo(() => orders.filter((o) => !o.isReturn), [orders]);
  const returns = useMemo(() => orders.filter((o) => o.isReturn), [orders]);
  // bills = received/partially-received POs with a payable amount
  const bills = useMemo(
    () => regularOrders.filter((o) => o.status === "RECEIVED" || o.status === "PARTIAL"),
    [regularOrders]
  );

  const filteredOrders = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return regularOrders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (!needle) return true;
      return o.number.toLowerCase().includes(needle) || o.supplierName.toLowerCase().includes(needle);
    });
  }, [regularOrders, q, status]);

  const ordersPager = usePagination(filteredOrders, 25);
  const receiptsPager = usePagination(receipts, 25);
  const billsPager = usePagination(bills, 25);
  const returnsPager = usePagination(returns, 25);

  const unpaidTotal = bills.filter((b) => !b.billPaid).reduce((s, b) => s + b.total, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchases"
        description={`${regularOrders.length} purchase orders · ${suppliers.length} suppliers`}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Purchases" }]}
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewPo({ isReturn: true })}><Undo2 size={15} /> Supplier return</Button>
            <Button onClick={() => setNewPo({ isReturn: false })}><Plus size={15} /> New purchase order</Button>
          </>
        }
      />

      <TabStrip
        tabs={[
          { id: "orders" as Tab, label: "Purchase orders", icon: Truck },
          { id: "received" as Tab, label: "Goods received", icon: PackageCheck },
          { id: "bills" as Tab, label: "Bills", icon: Receipt },
          { id: "returns" as Tab, label: "Returns", icon: Undo2 },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "orders" && (
        <>
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <div className="relative min-w-52 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number or supplier…"
                className="w-full rounded-lg bg-gray-100 py-2 pl-9 pr-3 text-sm outline-none ring-brand-500 focus:bg-white focus:ring-2" />
            </div>
            <div className="relative">
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="appearance-none rounded-lg bg-gray-100 py-2 pl-3 pr-8 text-sm outline-none ring-brand-500 focus:bg-white focus:ring-2 cursor-pointer">
                {["all", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"].map((s) => (
                  <option key={s} value={s}>{s === "all" ? "All statuses" : s.toLowerCase()}</option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </Card>

          <Card className="overflow-hidden">
            {ordersPager.rows.length === 0 ? (
              <EmptyState icon={<Truck size={28} />} title="No purchase orders match"
                hint="Create a purchase order to restock inventory — stock increases only when goods are received."
                action={<Button onClick={() => setNewPo({ isReturn: false })}><Plus size={15} /> New purchase order</Button>} />
            ) : (
              <>
                <PoTable rows={ordersPager.rows} currencySymbol={currencySymbol} />
                <Pagination page={ordersPager.page} pages={ordersPager.pages} total={ordersPager.total} onPage={ordersPager.setPage} />
              </>
            )}
          </Card>
        </>
      )}

      {tab === "received" && (
        <Card className="overflow-hidden">
          {receiptsPager.rows.length === 0 ? (
            <EmptyState icon={<PackageCheck size={28} />} title="No goods received yet"
              hint="Receive stock against a purchase order from its detail page." />
          ) : (
            <>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3 font-medium">When</th>
                      <th className="px-2 py-3 font-medium">Product</th>
                      <th className="px-2 py-3 font-medium">Warehouse</th>
                      <th className="px-2 py-3 text-right font-medium">Qty received</th>
                      <th className="px-2 py-3 font-medium">PO</th>
                      <th className="px-2 py-3 font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {receiptsPager.rows.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50/70">
                        <td className="px-4 py-2.5 text-gray-500">{fmtDateTime(r.createdAt)}</td>
                        <td className="px-2 py-2.5">
                          <p className="font-medium">{r.productName}</p>
                          <p className="font-mono text-xs text-gray-400">{r.sku}</p>
                        </td>
                        <td className="px-2 py-2.5 text-gray-600">{r.warehouseName}</td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-emerald-600">+{r.quantity}</td>
                        <td className="px-2 py-2.5 font-mono text-xs text-gray-500">{r.reference ?? "—"}</td>
                        <td className="px-2 py-2.5 text-gray-500">{r.userName ?? "System"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={receiptsPager.page} pages={receiptsPager.pages} total={receiptsPager.total} onPage={receiptsPager.setPage} />
            </>
          )}
        </Card>
      )}

      {tab === "bills" && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 text-sm">
            <span className="font-semibold">Supplier bills</span>
            <span>Unpaid total: <span className="font-bold text-red-600">{fmtMoney(unpaidTotal, currencySymbol)}</span></span>
          </div>
          {billsPager.rows.length === 0 ? (
            <EmptyState icon={<Receipt size={28} />} title="No bills yet"
              hint="Bills become payable once goods are received against a purchase order." />
          ) : (
            <>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3 font-medium">PO</th>
                      <th className="px-2 py-3 font-medium">Supplier</th>
                      <th className="px-2 py-3 font-medium">Received</th>
                      <th className="px-2 py-3 text-right font-medium">Amount</th>
                      <th className="px-2 py-3 font-medium">Payment</th>
                      <th className="px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {billsPager.rows.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50/70">
                        <td className="px-4 py-2.5">
                          <Link href={`/purchases/${b.id}`} className="font-mono text-xs font-semibold hover:text-brand-600">{b.number}</Link>
                        </td>
                        <td className="px-2 py-2.5">{b.supplierName}</td>
                        <td className="px-2 py-2.5 text-gray-500">{b.received}/{b.ordered} units · {fmtDate(b.orderDate)}</td>
                        <td className="px-2 py-2.5 text-right font-medium">{fmtMoney(b.total, currencySymbol)}</td>
                        <td className="px-2 py-2.5">
                          {b.billPaid ? <Badge color="green">paid</Badge> : <Badge color="amber">unpaid</Badge>}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          {!b.billPaid && (
                            <button
                              disabled={pending}
                              onClick={() => startTransition(async () => {
                                const res = await markBillPaid(b.id);
                                if (res?.error) toast("error", res.error);
                                else toast("success", `Bill for ${b.number} marked paid`);
                                router.refresh();
                              })}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 cursor-pointer">
                              <Check size={13} /> Mark paid
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={billsPager.page} pages={billsPager.pages} total={billsPager.total} onPage={billsPager.setPage} />
            </>
          )}
        </Card>
      )}

      {tab === "returns" && (
        <Card className="overflow-hidden">
          {returnsPager.rows.length === 0 ? (
            <EmptyState icon={<Undo2 size={28} />} title="No supplier returns"
              hint="Return goods to a supplier — stock leaves the warehouse when the return is created."
              action={<Button onClick={() => setNewPo({ isReturn: true })}><Plus size={15} /> New return</Button>} />
          ) : (
            <>
              <PoTable rows={returnsPager.rows} currencySymbol={currencySymbol} />
              <Pagination page={returnsPager.page} pages={returnsPager.pages} total={returnsPager.total} onPage={returnsPager.setPage} />
            </>
          )}
        </Card>
      )}

      {newPo && (
        <PoModal isReturn={newPo.isReturn} suppliers={suppliers} warehouses={warehouses}
          products={products} currencySymbol={currencySymbol} onClose={() => setNewPo(false)} />
      )}
    </div>
  );
}

function PoTable({ rows, currencySymbol }: { rows: Order[]; currencySymbol: string }) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="px-4 py-3 font-medium">Number</th>
            <th className="px-2 py-3 font-medium">Supplier</th>
            <th className="px-2 py-3 font-medium">Warehouse</th>
            <th className="px-2 py-3 font-medium">Ordered</th>
            <th className="px-2 py-3 text-right font-medium">Progress</th>
            <th className="px-2 py-3 text-right font-medium">Total</th>
            <th className="px-2 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((o) => (
            <tr key={o.id} className="group hover:bg-gray-50/70">
              <td className="px-4 py-2.5">
                <Link href={`/purchases/${o.id}`} className="font-mono text-xs font-semibold group-hover:text-brand-600">
                  {o.number}{o.isReturn && <span className="ml-1.5 rounded bg-red-50 px-1 py-0.5 text-[10px] font-medium text-red-600">RETURN</span>}
                </Link>
              </td>
              <td className="px-2 py-2.5">{o.supplierName}</td>
              <td className="px-2 py-2.5 text-gray-500">{o.warehouseName}</td>
              <td className="px-2 py-2.5 text-gray-500">{fmtDate(o.orderDate)}</td>
              <td className="px-2 py-2.5 text-right text-gray-500 tabular-nums">{o.received}/{o.ordered}</td>
              <td className="px-2 py-2.5 text-right font-medium">{fmtMoney(o.total, currencySymbol)}</td>
              <td className="px-2 py-2.5"><StatusBadge status={o.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PoModal({
  isReturn, suppliers, warehouses, products, currencySymbol, onClose,
}: {
  isReturn: boolean; suppliers: SupplierOpt[]; warehouses: Wh[]; products: ProductOpt[];
  currencySymbol: string; onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [lines, setLines] = useState<{ productId: string; quantity: number; unitCost: number }[]>([
    { productId: "", quantity: 1, unitCost: 0 },
  ]);
  const boundAction = createPurchaseOrder.bind(null, lines.filter((l) => l.productId && l.quantity > 0));
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  useEffect(() => {
    if (state?.success) {
      toast("success", isReturn ? "Supplier return recorded" : "Purchase order created");
      onClose();
      router.refresh();
    }
  }, [state, onClose, router, toast, isReturn]);

  const total = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

  return (
    <Modal title={isReturn ? "New supplier return" : "New purchase order"} onClose={onClose} wide>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="isReturn" value={isReturn ? "true" : ""} />
        {isReturn && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Returned goods leave the selected warehouse immediately when you save.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Supplier">
            <select name="supplierId" required defaultValue="" className={inputCls}>
              <option value="" disabled>Choose…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Warehouse">
            <select name="warehouseId" required defaultValue="" className={inputCls}>
              <option value="" disabled>Choose…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          {!isReturn && (
            <Field label="Expected date">
              <input name="expectedDate" type="date" className={inputCls} />
            </Field>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">Lines</span>
            <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: 1, unitCost: 0 }])}
              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer">
              <Plus size={13} /> Add line
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2">
                <select value={line.productId}
                  onChange={(e) => {
                    const p = products.find((x) => x.id === e.target.value);
                    setLines(lines.map((x, j) => (j === i ? { ...x, productId: e.target.value, unitCost: p?.costPrice ?? 0 } : x)));
                  }}
                  className={inputCls}>
                  <option value="">Choose product…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.imageEmoji ?? ""} {p.name} ({p.sku})</option>)}
                </select>
                <input type="number" min={1} value={line.quantity} title="Quantity"
                  onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))}
                  className={`${inputCls} w-20`} />
                <input type="number" min={0} step="0.01" value={line.unitCost} title="Unit cost"
                  onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitCost: Number(e.target.value) } : x)))}
                  className={`${inputCls} w-28`} />
                <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-right text-sm font-semibold">Total: {fmtMoney(total, currencySymbol)}</p>
        </div>

        <Field label="Note (optional)"><input name="note" className={inputCls} /></Field>

        <ErrorText>{state?.error}</ErrorText>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 size={15} className="animate-spin" />}
            {isReturn ? "Create return" : "Create order"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
