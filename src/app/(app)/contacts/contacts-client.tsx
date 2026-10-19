"use client";

import { Building2, Loader2, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { createSupplier } from "@/actions/purchases";
import { createCustomer } from "@/actions/sales";
import {
  Badge, Button, Card, EmptyState, ErrorText, Field, Modal, PageHeader,
  Pagination, TabStrip, inputCls, usePagination, useToast,
} from "@/components/ui";
import { fmtMoney } from "@/lib/format";

type ContactRow = {
  id: string; name: string; email: string | null; phone: string | null;
  orderCount: number; totalSpend: number; outstanding: number;
};

type Tab = "customers" | "suppliers";

export default function ContactsClient({
  customers, suppliers, currencySymbol,
}: {
  customers: ContactRow[]; suppliers: ContactRow[]; currencySymbol: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const urlTab = params.get("tab") as Tab | null;
  // tab derives from the URL so sidebar submenu links work without state syncing
  const tab: Tab = urlTab === "suppliers" ? "suppliers" : "customers";
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState<false | Tab>(false);

  const setTab = (t: Tab) => {
    router.replace(`/contacts?tab=${t}`);
  };

  const rows = tab === "customers" ? customers : suppliers;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      r.name.toLowerCase().includes(needle) ||
      (r.email ?? "").toLowerCase().includes(needle) ||
      (r.phone ?? "").toLowerCase().includes(needle)
    );
  }, [rows, q]);
  const pager = usePagination(filtered, 25);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contacts"
        description={`${customers.length} customers · ${suppliers.length} suppliers`}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Contacts" }]}
        actions={
          <Button onClick={() => setCreating(tab)}>
            <Plus size={15} /> {tab === "customers" ? "Add customer" : "Add supplier"}
          </Button>
        }
      />

      <TabStrip
        tabs={[
          { id: "customers" as Tab, label: "Customers", icon: Users },
          { id: "suppliers" as Tab, label: "Suppliers", icon: Building2 },
        ]}
        active={tab}
        onChange={setTab}
      />

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-52 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone…"
            className="w-full rounded-lg bg-gray-100 py-2 pl-9 pr-3 text-sm outline-none ring-brand-500 focus:bg-white focus:ring-2" />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {pager.rows.length === 0 ? (
          <EmptyState
            icon={tab === "customers" ? <Users size={28} /> : <Building2 size={28} />}
            title={q ? "No contacts match" : `No ${tab} yet`}
            action={<Button onClick={() => setCreating(tab)}><Plus size={15} /> Add {tab === "customers" ? "customer" : "supplier"}</Button>}
          />
        ) : (
          <>
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-2 py-3 font-medium">Email</th>
                    <th className="px-2 py-3 font-medium">Phone</th>
                    <th className="px-2 py-3 text-right font-medium">Orders</th>
                    <th className="px-2 py-3 text-right font-medium">{tab === "customers" ? "Lifetime value" : "Total purchased"}</th>
                    <th className="px-2 py-3 text-right font-medium">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pager.rows.map((c) => (
                    <tr key={c.id} className="group hover:bg-gray-50/70">
                      <td className="px-4 py-2.5">
                        <Link href={`/contacts/${tab === "customers" ? "customer" : "supplier"}/${c.id}`}
                          className="font-medium group-hover:text-brand-600">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 text-gray-500">{c.email ?? "—"}</td>
                      <td className="px-2 py-2.5 text-gray-500">{c.phone ?? "—"}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{c.orderCount}</td>
                      <td className="px-2 py-2.5 text-right font-medium">{fmtMoney(c.totalSpend, currencySymbol)}</td>
                      <td className="px-2 py-2.5 text-right">
                        {c.outstanding > 0
                          ? <Badge color="amber">{fmtMoney(c.outstanding, currencySymbol)}</Badge>
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pager.page} pages={pager.pages} total={pager.total} onPage={pager.setPage} />
          </>
        )}
      </Card>

      {creating && <ContactModal kind={creating} onClose={() => setCreating(false)} />}
    </div>
  );
}

function ContactModal({ kind, onClose }: { kind: Tab; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const action = kind === "customers" ? createCustomer : createSupplier;
  const [state, formAction, pending] = useActionState(action, undefined);
  useEffect(() => {
    if (state?.success) {
      toast("success", kind === "customers" ? "Customer added" : "Supplier added");
      onClose();
      router.refresh();
    }
  }, [state, onClose, router, toast, kind]);
  return (
    <Modal title={kind === "customers" ? "Add customer" : "Add supplier"} onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <Field label="Name"><input name="name" required className={inputCls} /></Field>
        <Field label="Email"><input name="email" type="email" className={inputCls} /></Field>
        <Field label="Phone"><input name="phone" className={inputCls} /></Field>
        <Field label="Address"><input name="address" className={inputCls} /></Field>
        <ErrorText>{state?.error}</ErrorText>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 size={15} className="animate-spin" />} Add
          </Button>
        </div>
      </form>
    </Modal>
  );
}
