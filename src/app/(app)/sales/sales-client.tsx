"use client";

import {
  Check, ChevronDown, FileText, Loader2, Plus, Receipt, Search,
  ShoppingCart, Trash2, Truck, Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { createSalesOrder, markInvoicePaid } from "@/actions/sales";
import {
  Badge, Button, Card, EmptyState, ErrorText, Field, Modal, PageHeader,
  Pagination, StatusBadge, TabStrip, inputCls, usePagination, useToast,
} from "@/components/ui";
import { fmtDate, fmtMoney } from "@/lib/format";

type Order = {
  id: string; number: string; customerName: string; warehouseName: string; status: string;
  isReturn: boolean; orderDate: string; total: number; units: number; fulfilledUnits: number; hasInvoice: boolean;
};
type InvoiceRow = {
  id: string; number: string; soNumber: string; soId: string; customerName: string;
  status: string; amount: number; issuedAt: string; dueAt: string;
};
type CustomerOpt = { id: string; name: string };
type Wh = { id: string; code: string; name: string };
type ProductOpt = { id: string; name: string; sku: string; imageEmoji: string | null; sellingPrice: number; totalStock: number };

type Tab = "orders" | "invoices" | "shipments" | "returns";
const TABS: Tab[] = ["orders", "invoices", "shipments", "returns"];

export default function SalesClient({
  orders, invoices, customers, warehouses, products, currencySymbol,
}: {
  orders: Order[]; invoices: InvoiceRow[]; customers: CustomerOpt[]; warehouses: Wh[];
  products: ProductOpt[]; currencySymbol: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const urlTab = params.get("tab") as Tab | null;
  // tab derives from the URL so sidebar submenu links work without state syncing
  const tab: Tab = urlTab && TABS.includes(urlTab) ? urlTab : "orders";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [soModal, setSoModal] = useState<false | { isReturn: boolean }>(false);
  const [deepLinkClosed, setDeepLinkClosed] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  // ?new=so deep link opens the create modal until explicitly closed
  const newSo = soModal || (params.get("new") === "so" && !deepLinkClosed ? { isReturn: false } : false);
  const setNewSo = (v: false | { isReturn: boolean }) => {
    if (v === false) setDeepLinkClosed(true);
    setSoModal(v);
  };

  const setTab = (t: Tab) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", t);
    sp.delete("new");
    setDeepLinkClosed(false);
    router.replace(`/sales?${sp.toString()}`);
  };

  const regularOrders = useMemo(() => orders.filter((o) => !o.isReturn), [orders]);
  const returns = useMemo(() => orders.filter((o) => o.isReturn), [orders]);
  // shipments = orders that have shipped or delivered (fulfilment records)
  const shipments = useMemo(
    () => regularOrders.filter((o) => o.status === "SHIPPED" || o.status === "DELIVERED"),
    [regularOrders]
  );

  const filteredOrders = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return regularOrders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (!needle) return true;
      return o.number.toLowerCase().includes(needle) || o.customerName.toLowerCase().includes(needle);
    });
  }, [regularOrders, q, status]);

  const filteredInvoices = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return invoices.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (!needle) return true;
      return i.number.toLowerCase().includes(needle) || i.customerName.toLowerCase().includes(needle) || i.soNumber.toLowerCase().includes(needle);
    });
  }, [invoices, q, status]);

  const ordersPager = usePagination(filteredOrders, 25);
  const invoicesPager = usePagination(filteredInvoices, 25);
  const shipmentsPager = usePagination(shipments, 25);
  const returnsPager = usePagination(returns, 25);

  const outstanding = invoices.filter((i) => i.status !== "PAID").reduce((s, i) => s + i.amount, 0);
  const overdue = invoices.filter((i) => i.status === "OVERDUE").reduce((s, i) => s + i.amount, 0);

  const statusOptions =
    tab === "invoices"
      ? ["all", "SENT", "PAID", "OVERDUE"]
      : ["all", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED"];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sales"
        description={`${regularOrders.length} orders · ${invoices.length} invoices · ${returns.length} returns`}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Sales" }]}
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewSo({ isReturn: true })}><Undo2 size={15} /> Sales return</Button>
            <Button onClick={() => setNewSo({ isReturn: false })}><Plus size={15} /> New sales order</Button>
          </>
        }
      />

      <TabStrip
        tabs={[
          { id: "orders" as Tab, label: "Sales orders", icon: ShoppingCart },
          { id: "invoices" as Tab, label: "Invoices", icon: Receipt },
          { id: "shipments" as Tab, label: "Shipments", icon: Truck },
          { id: "returns" as Tab, label: "Returns", icon: Undo2 },
        ]}
        active={tab}
        onChange={setTab}
      />

      {(tab === "orders" || tab === "invoices") && (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-52 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number or customer…"
              className="w-full rounded-lg bg-gray-100 py-2 pl-9 pr-3 text-sm outline-none ring-brand-500 focus:bg-white focus:ring-2" />
          </div>
          <div className="relative">
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="appearance-none rounded-lg bg-gray-100 py-2 pl-3 pr-8 text-sm outline-none ring-brand-500 focus:bg-white focus:ring-2 cursor-pointer">
              {statusOptions.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s.toLowerCase()}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          {tab === "invoices" && (
            <div className="ml-auto flex gap-5 text-right text-sm">
              <span>Outstanding <span className="font-bold">{fmtMoney(outstanding, currencySymbol)}</span></span>
              <span className="text-red-600">Overdue <span className="font-bold">{fmtMoney(overdue, currencySymbol)}</span></span>
            </div>
          )}
        </Card>
      )}

      {tab === "orders" && (
        <Card className="overflow-hidden">
          {ordersPager.rows.length === 0 ? (
            <EmptyState icon={<ShoppingCart size={28} />} title="No sales orders match"
              hint="Create a sales order to start selling."
              action={<Button onClick={() => setNewSo({ isReturn: false })}><Plus size={15} /> New sales order</Button>} />
          ) : (
            <>
              <OrderTable rows={ordersPager.rows} currencySymbol={currencySymbol} />
              <Pagination page={ordersPager.page} pages={ordersPager.pages} total={ordersPager.total} onPage={ordersPager.setPage} />
            </>
          )}
        </Card>
      )}

      {tab === "invoices" && (
        <Card className="overflow-hidden">
          {invoicesPager.rows.length === 0 ? (
            <EmptyState icon={<Receipt size={28} />} title="No invoices match"
              hint="Generate invoices from a sales order's detail page." />
          ) : (
            <>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3 font-medium">Invoice</th>
                      <th className="px-2 py-3 font-medium">Order</th>
                      <th className="px-2 py-3 font-medium">Customer</th>
                      <th className="px-2 py-3 font-medium">Issued</th>
                      <th className="px-2 py-3 font-medium">Due</th>
                      <th className="px-2 py-3 text-right font-medium">Amount</th>
                      <th className="px-2 py-3 font-medium">Status</th>
                      <th className="px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {invoicesPager.rows.map((i) => (
                      <tr key={i.id} className="hover:bg-gray-50/70">
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold">{i.number}</td>
                        <td className="px-2 py-2.5">
                          <Link href={`/sales/${i.soId}`} className="font-mono text-xs text-gray-500 hover:text-brand-600">{i.soNumber}</Link>
                        </td>
                        <td className="px-2 py-2.5">{i.customerName}</td>
                        <td className="px-2 py-2.5 text-gray-500">{fmtDate(i.issuedAt)}</td>
                        <td className="px-2 py-2.5 text-gray-500">{fmtDate(i.dueAt)}</td>
                        <td className="px-2 py-2.5 text-right font-medium">{fmtMoney(i.amount, currencySymbol)}</td>
                        <td className="px-2 py-2.5"><StatusBadge status={i.status} /></td>
                        <td className="px-2 py-2.5 text-right">
                          {i.status !== "PAID" && (
                            <button
                              disabled={pending}
                              onClick={() => startTransition(async () => {
                                const res = await markInvoicePaid(i.id);
                                if (res?.error) toast("error", res.error);
                                else toast("success", `${i.number} marked paid`);
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
              <Pagination page={invoicesPager.page} pages={invoicesPager.pages} total={invoicesPager.total} onPage={invoicesPager.setPage} />
            </>
          )}
        </Card>
      )}

      {tab === "shipments" && (
        <Card className="overflow-hidden">
          {shipmentsPager.rows.length === 0 ? (
            <EmptyState icon={<Truck size={28} />} title="No shipments yet"
              hint="Fulfilled sales orders appear here once shipped." />
          ) : (
            <>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3 font-medium">Order</th>
                      <th className="px-2 py-3 font-medium">Customer</th>
                      <th className="px-2 py-3 font-medium">Shipped from</th>
                      <th className="px-2 py-3 text-right font-medium">Units shipped</th>
                      <th className="px-2 py-3 font-medium">Status</th>
                      <th className="px-2 py-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {shipmentsPager.rows.map((o) => (
                      <tr key={o.id} className="group hover:bg-gray-50/70">
                        <td className="px-4 py-2.5">
                          <Link href={`/sales/${o.id}`} className="font-mono text-xs font-semibold group-hover:text-brand-600">{o.number}</Link>
                        </td>
                        <td className="px-2 py-2.5">{o.customerName}</td>
                        <td className="px-2 py-2.5 text-gray-500">{o.warehouseName}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{o.fulfilledUnits}/{o.units}</td>
                        <td className="px-2 py-2.5"><StatusBadge status={o.status} /></td>
                        <td className="px-2 py-2.5 text-gray-500">{fmtDate(o.orderDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={shipmentsPager.page} pages={shipmentsPager.pages} total={shipmentsPager.total} onPage={shipmentsPager.setPage} />
            </>
          )}
        </Card>
      )}

      {tab === "returns" && (
        <Card className="overflow-hidden">
          {returnsPager.rows.length === 0 ? (
            <EmptyState icon={<Undo2 size={28} />} title="No sales returns"
              hint="Record a return to receive goods back into stock."
              action={<Button onClick={() => setNewSo({ isReturn: true })}><Plus size={15} /> New return</Button>} />
          ) : (
            <>
              <OrderTable rows={returnsPager.rows} currencySymbol={currencySymbol} />
              <Pagination page={returnsPager.page} pages={returnsPager.pages} total={returnsPager.total} onPage={returnsPager.setPage} />
            </>
          )}
        </Card>
      )}

      {newSo && (
        <SoModal isReturn={newSo.isReturn} customers={customers} warehouses={warehouses}
          products={products} currencySymbol={currencySymbol} onClose={() => setNewSo(false)} />
      )}
    </div>
  );
}

function OrderTable({ rows, currencySymbol }: { rows: Order[]; currencySymbol: string }) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="px-4 py-3 font-medium">Number</th>
            <th className="px-2 py-3 font-medium">Customer</th>
            <th className="px-2 py-3 font-medium">Warehouse</th>
            <th className="px-2 py-3 font-medium">Date</th>
            <th className="px-2 py-3 text-right font-medium">Total</th>
            <th className="px-2 py-3 font-medium">Invoice</th>
            <th className="px-2 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((o) => (
            <tr key={o.id} className="group hover:bg-gray-50/70">
              <td className="px-4 py-2.5">
                <Link href={`/sales/${o.id}`} className="font-mono text-xs font-semibold group-hover:text-brand-600">
                  {o.number}{o.isReturn && <span className="ml-1.5 rounded bg-red-50 px-1 py-0.5 text-[10px] font-medium text-red-600">RETURN</span>}
                </Link>
              </td>
              <td className="px-2 py-2.5">{o.customerName}</td>
              <td className="px-2 py-2.5 text-gray-500">{o.warehouseName}</td>
              <td className="px-2 py-2.5 text-gray-500">{fmtDate(o.orderDate)}</td>
              <td className="px-2 py-2.5 text-right font-medium">{fmtMoney(o.total, currencySymbol)}</td>
              <td className="px-2 py-2.5">{o.hasInvoice ? <Badge color="green"><FileText size={11} /> invoiced</Badge> : <span className="text-xs text-gray-300">—</span>}</td>
              <td className="px-2 py-2.5"><StatusBadge status={o.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SoModal({
  isReturn, customers, warehouses, products, currencySymbol, onClose,
}: {
  isReturn: boolean; customers: CustomerOpt[]; warehouses: Wh[]; products: ProductOpt[];
  currencySymbol: string; onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [lines, setLines] = useState<{ productId: string; quantity: number; unitPrice: number }[]>([
    { productId: "", quantity: 1, unitPrice: 0 },
  ]);
  const boundAction = createSalesOrder.bind(null, lines.filter((l) => l.productId && l.quantity > 0));
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  useEffect(() => {
    if (state?.success) {
      toast("success", isReturn ? "Sales return recorded" : "Sales order created");
      onClose();
      router.refresh();
    }
  }, [state, onClose, router, toast, isReturn]);

  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  return (
    <Modal title={isReturn ? "New sales return" : "New sales order"} onClose={onClose} wide>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="isReturn" value={isReturn ? "true" : ""} />
        {isReturn && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Returned goods are added back to the selected warehouse immediately when you save.
          </p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Customer">
            <select name="customerId" required defaultValue="" className={inputCls}>
              <option value="" disabled>Choose…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Fulfil from warehouse">
            <select name="warehouseId" required defaultValue="" className={inputCls}>
              <option value="" disabled>Choose…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">Lines</span>
            <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: 1, unitPrice: 0 }])}
              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer">
              <Plus size={13} /> Add line
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, i) => {
              const prod = products.find((p) => p.id === line.productId);
              return (
                <div key={i}>
                  <div className="flex gap-2">
                    <select value={line.productId}
                      onChange={(e) => {
                        const p = products.find((x) => x.id === e.target.value);
                        setLines(lines.map((x, j) => (j === i ? { ...x, productId: e.target.value, unitPrice: p?.sellingPrice ?? 0 } : x)));
                      }}
                      className={inputCls}>
                      <option value="">Choose product…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.imageEmoji ?? ""} {p.name} ({p.totalStock} in stock)</option>
                      ))}
                    </select>
                    <input type="number" min={1} value={line.quantity} title="Quantity"
                      onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))}
                      className={`${inputCls} w-20`} />
                    <input type="number" min={0} step="0.01" value={line.unitPrice} title="Unit price"
                      onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))}
                      className={`${inputCls} w-28`} />
                    <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))}
                      className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {!isReturn && prod && line.quantity > prod.totalStock && (
                    <p className="mt-1 text-xs text-amber-600">⚠ Only {prod.totalStock} in stock across all warehouses — fulfilment may fail.</p>
                  )}
                </div>
              );
            })}
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
