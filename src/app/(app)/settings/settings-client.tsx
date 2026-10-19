"use client";

import {
  Bell, Building2, Check, Landmark, Loader2, Plus, Ruler, ShieldCheck,
  Tag, Trash2, UserCheck, Users, Warehouse as WarehouseIcon, X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { createWarehouse } from "@/actions/inventory";
import {
  approveUser, createCategoryNamed, createTaxRate, createUser, deleteCategory,
  deleteTaxRate, deleteUser, rejectUser, updateOrganization, updatePreferences,
  updateUnits, updateUserRole,
} from "@/actions/settings";
import {
  Badge, Button, Card, ConfirmDialog, ErrorText, Field, Modal, PageHeader,
  TabStrip, inputCls, useToast,
} from "@/components/ui";
import { fmtDate } from "@/lib/format";

type Tax = { id: string; name: string; rate: number; isDefault: boolean };
type UserRow = {
  id: string; name: string; email: string; role: "ADMIN" | "MANAGER" | "STAFF";
  status: "ACTIVE" | "PENDING"; requestedRole: "ADMIN" | "MANAGER" | "STAFF" | null; createdAt: string;
};
type CategoryRow = { id: string; name: string; productCount: number };
type WhRow = { id: string; code: string; name: string; address: string | null; isPrimary: boolean; levelCount: number };
type Org = {
  name: string; businessType: string; currency: string; currencySymbol: string;
  timezone: string; address: string; units: string[]; defaultReorderPoint: number; lowStockEmailAlerts: boolean;
};

const CURRENCIES = [
  { code: "USD", symbol: "$" }, { code: "EUR", symbol: "€" }, { code: "GBP", symbol: "£" },
  { code: "INR", symbol: "₹" }, { code: "JPY", symbol: "¥" }, { code: "AUD", symbol: "A$" },
];

type Tab = "company" | "warehouses" | "users" | "categories" | "units" | "taxes" | "preferences";
const TABS: Tab[] = ["company", "warehouses", "users", "categories", "units", "taxes", "preferences"];

export default function SettingsClient({
  me, org, taxRates, users, categories, warehouses,
}: {
  me: { id: string; role: string };
  org: Org;
  taxRates: Tax[];
  users: UserRow[];
  categories: CategoryRow[];
  warehouses: WhRow[];
}) {
  const isAdmin = me.role === "ADMIN";
  const isManager = me.role === "ADMIN" || me.role === "MANAGER";
  const router = useRouter();
  const params = useSearchParams();
  const urlTab = params.get("tab") as Tab | null;
  // tab derives from the URL so notification deep-links work without state syncing
  const tab: Tab = urlTab && TABS.includes(urlTab) ? urlTab : "company";

  const setTab = (t: Tab) => {
    router.replace(`/settings?tab=${t}`);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description={isAdmin ? "Full admin access" : `Signed in as ${me.role.toLowerCase()} — some sections need an admin`}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Settings" }]}
      />

      <TabStrip
        tabs={[
          { id: "company" as Tab, label: "Company profile", icon: Building2 },
          { id: "warehouses" as Tab, label: "Warehouses", icon: WarehouseIcon },
          { id: "users" as Tab, label: "Users & roles", icon: Users },
          { id: "categories" as Tab, label: "Categories", icon: Tag },
          { id: "units" as Tab, label: "Units", icon: Ruler },
          { id: "taxes" as Tab, label: "Taxes & currency", icon: Landmark },
          { id: "preferences" as Tab, label: "Preferences", icon: Bell },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "company" && <OrgForm org={org} disabled={!isAdmin} />}
      {tab === "warehouses" && <WarehousesSection warehouses={warehouses} disabled={!isManager} />}
      {tab === "users" && <UsersSection users={users} meId={me.id} disabled={!isAdmin} />}
      {tab === "categories" && <CategoriesSection categories={categories} disabled={!isManager} />}
      {tab === "units" && <UnitsSection units={org.units} disabled={!isAdmin} />}
      {tab === "taxes" && <TaxSection org={org} taxRates={taxRates} disabled={!isAdmin} />}
      {tab === "preferences" && <PreferencesSection org={org} disabled={!isAdmin} />}
    </div>
  );
}

/* ---------- Company profile ---------- */
function OrgForm({ org, disabled }: { org: Org; disabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(updateOrganization, undefined);
  useEffect(() => {
    if (state?.success) { toast("success", "Organization saved"); router.refresh(); }
  }, [state, router, toast]);

  return (
    <Card className="max-w-xl p-6">
      <form action={formAction} className="space-y-4">
        <Field label="Organization name">
          <input name="name" required defaultValue={org.name} disabled={disabled} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency">
            <select name="currency" defaultValue={org.currency} disabled={disabled} className={inputCls}
              onChange={(e) => {
                const c = CURRENCIES.find((x) => x.code === e.target.value);
                const symInput = document.querySelector<HTMLInputElement>("input[name=currencySymbol]");
                if (c && symInput) symInput.value = c.symbol;
              }}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </Field>
          <Field label="Currency symbol">
            <input name="currencySymbol" required defaultValue={org.currencySymbol} disabled={disabled} className={inputCls} />
          </Field>
        </div>
        <Field label="Timezone">
          <input name="timezone" required defaultValue={org.timezone} disabled={disabled} className={inputCls} />
        </Field>
        <Field label="Address">
          <input name="address" defaultValue={org.address} disabled={disabled} className={inputCls} />
        </Field>
        <ErrorText>{state?.error}</ErrorText>
        {!disabled && (
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 size={15} className="animate-spin" />} Save organization
          </Button>
        )}
      </form>
    </Card>
  );
}

/* ---------- Warehouses ---------- */
function WarehousesSection({ warehouses, disabled }: { warehouses: WhRow[]; disabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [creatingRaw, setCreating] = useState(false);
  const [state, formAction, pending] = useActionState(createWarehouse, undefined);
  // modal visibility derives from action success — no setState inside the effect
  const creating = creatingRaw && !state?.success;
  useEffect(() => {
    if (state?.success) { toast("success", "Warehouse created"); router.refresh(); }
  }, [state, router, toast]);

  return (
    <Card className="max-w-2xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-semibold">Warehouses ({warehouses.length})</h2>
        {!disabled && <Button variant="secondary" onClick={() => setCreating(true)}><Plus size={14} /> Add warehouse</Button>}
      </div>
      <ul className="divide-y divide-gray-50">
        {warehouses.map((w) => (
          <li key={w.id} className="flex items-center gap-3 px-5 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <WarehouseIcon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{w.name} {w.isPrimary && <Badge color="blue">primary</Badge>}</p>
              <p className="text-xs text-gray-400">{w.code}{w.address ? ` · ${w.address}` : ""}</p>
            </div>
            <span className="text-xs text-gray-400">{w.levelCount} stock entries</span>
          </li>
        ))}
      </ul>
      {creating && (
        <Modal title="New warehouse" onClose={() => setCreating(false)}>
          <form action={formAction} className="space-y-4">
            <Field label="Code"><input name="code" required placeholder="LAX" className={inputCls} /></Field>
            <Field label="Name"><input name="name" required placeholder="Los Angeles Hub" className={inputCls} /></Field>
            <Field label="Address"><input name="address" className={inputCls} /></Field>
            <ErrorText>{state?.error}</ErrorText>
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 size={15} className="animate-spin" />} Create
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}

/* ---------- Categories ---------- */
function CategoriesSection({ categories, disabled }: { categories: CategoryRow[]; disabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState<CategoryRow | null>(null);
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      const res = await createCategoryNamed(name);
      if (res?.error) toast("error", res.error);
      else { toast("success", `Category "${name}" added`); setName(""); router.refresh(); }
    });

  return (
    <Card className="max-w-xl overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-semibold">Item categories ({categories.length})</h2>
      </div>
      {!disabled && (
        <div className="flex gap-2 border-b border-gray-50 px-5 py-3">
          <input value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && add()}
            placeholder="New category name…" className={inputCls} />
          <Button onClick={add} disabled={pending || !name.trim()}>
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
          </Button>
        </div>
      )}
      <ul className="divide-y divide-gray-50">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
            <span className="font-medium">{c.name}</span>
            <span className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{c.productCount} item(s)</span>
              {!disabled && (
                <button onClick={() => setConfirming(c)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                  <Trash2 size={14} />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {confirming && (
        <ConfirmDialog
          title={`Delete category "${confirming.name}"?`}
          message={`${confirming.productCount} item(s) will become uncategorized. This cannot be undone.`}
          onConfirm={() => startTransition(async () => {
            const res = await deleteCategory(confirming.id);
            if (res?.error) toast("error", res.error);
            else { toast("success", "Category deleted"); router.refresh(); }
          })}
          onClose={() => setConfirming(null)}
        />
      )}
    </Card>
  );
}

/* ---------- Units of measurement ---------- */
function UnitsSection({ units, disabled }: { units: string[]; disabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState(units);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  const save = (next: string[]) =>
    startTransition(async () => {
      const res = await updateUnits(next);
      if (res?.error) toast("error", res.error);
      else { toast("success", "Units saved"); setList(next); router.refresh(); }
    });

  return (
    <Card className="max-w-xl p-6">
      <h2 className="mb-1 text-sm font-semibold">Units of measurement</h2>
      <p className="mb-4 text-xs text-gray-500">Offered in the item form (e.g. pcs, box, kg, litre).</p>
      <div className="flex flex-wrap gap-2">
        {list.map((u) => (
          <span key={u} className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm">
            {u}
            {!disabled && list.length > 1 && (
              <button onClick={() => save(list.filter((x) => x !== u))} disabled={pending}
                className="text-gray-400 hover:text-red-500 cursor-pointer"><X size={13} /></button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="mt-4 flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { save([...list, draft.trim()]); setDraft(""); } }}
            placeholder="Add unit…" className={inputCls} />
          <Button disabled={pending || !draft.trim()} onClick={() => { save([...list, draft.trim()]); setDraft(""); }}>
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ---------- Taxes & currency ---------- */
function TaxSection({ org, taxRates, disabled }: { org: Org; taxRates: Tax[]; disabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(createTaxRate, undefined);
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (state?.success) { toast("success", "Tax rate added"); router.refresh(); }
  }, [state, router, toast]);

  return (
    <div className="grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
      <Card className="p-6">
        <h2 className="mb-3 text-sm font-semibold">Tax rates</h2>
        <ul className="divide-y divide-gray-50">
          {taxRates.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2 text-sm">
              <span>{t.name} {t.isDefault && <Badge color="blue">default</Badge>}</span>
              <span className="flex items-center gap-3">
                <span className="font-semibold">{t.rate}%</span>
                {!disabled && (
                  <button
                    onClick={() => startTransition(async () => { await deleteTaxRate(t.id); toast("success", "Tax rate deleted"); router.refresh(); })}
                    className="text-gray-300 hover:text-red-500 cursor-pointer"><Trash2 size={14} /></button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-400">
          Base currency: <span className="font-medium text-gray-600">{org.currency} ({org.currencySymbol})</span> — change it in Company profile.
        </p>
      </Card>

      {!disabled && (
        <Card className="p-6">
          <h2 className="mb-3 text-sm font-semibold">Add tax rate</h2>
          <form action={formAction} className="space-y-3">
            <Field label="Name"><input name="name" required placeholder="VAT standard" className={inputCls} /></Field>
            <Field label="Rate %"><input name="rate" type="number" step="0.01" min="0" max="100" required className={inputCls} /></Field>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" name="isDefault" value="true" className="accent-brand-600" /> Make default
            </label>
            <ErrorText>{state?.error}</ErrorText>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 size={15} className="animate-spin" />} <Plus size={14} /> Add rate
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}

/* ---------- Preferences & notifications ---------- */
function PreferencesSection({ org, disabled }: { org: Org; disabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(updatePreferences, undefined);
  useEffect(() => {
    if (state?.success) { toast("success", "Preferences saved"); router.refresh(); }
  }, [state, router, toast]);

  return (
    <Card className="max-w-xl p-6">
      <h2 className="mb-1 text-sm font-semibold">Inventory preferences & notifications</h2>
      <p className="mb-4 text-xs text-gray-500">Defaults applied to new items and alerting behaviour.</p>
      <form action={formAction} className="space-y-4">
        <Field label="Default reorder point for new items">
          <input name="defaultReorderPoint" type="number" min="0" defaultValue={org.defaultReorderPoint}
            disabled={disabled} className={inputCls} />
        </Field>
        <label className="flex items-start gap-2.5 rounded-xl bg-gray-50 p-3 ring-1 ring-inset ring-gray-200">
          <input type="checkbox" name="lowStockEmailAlerts" value="true" defaultChecked={org.lowStockEmailAlerts}
            disabled={disabled} className="mt-0.5 accent-brand-600" />
          <span>
            <span className="block text-sm font-medium text-gray-800">Low-stock alerts</span>
            <span className="block text-xs text-gray-500">
              Raise in-app notifications when stock dips to the reorder point, and clear them automatically when it recovers.
            </span>
          </span>
        </label>
        <ErrorText>{state?.error}</ErrorText>
        {!disabled && (
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 size={15} className="animate-spin" />} Save preferences
          </Button>
        )}
      </form>
    </Card>
  );
}

/* ---------- Users & roles (with admin-approval queue) ---------- */
function UsersSection({ users, meId, disabled }: { users: UserRow[]; meId: string; disabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<UserRow | null>(null);
  const [pending, startTransition] = useTransition();
  const pendingUsers = users.filter((u) => u.status === "PENDING");
  const activeUsers = users.filter((u) => u.status === "ACTIVE");

  const changeRole = (id: string, role: UserRow["role"]) =>
    startTransition(async () => {
      const res = await updateUserRole(id, role);
      if (res?.error) toast("error", res.error);
      else { toast("success", "Role updated"); router.refresh(); }
    });

  const decide = (id: string, approve: boolean) =>
    startTransition(async () => {
      const res = approve ? await approveUser(id) : await rejectUser(id);
      if (res?.error) toast("error", res.error);
      else { toast("success", approve ? "Request approved" : "Request rejected"); router.refresh(); }
    });

  return (
    <div className="max-w-3xl space-y-4">
      {!disabled && pendingUsers.length > 0 && (
        <Card className="overflow-hidden ring-2 ring-violet-200">
          <div className="flex items-center gap-2 border-b border-violet-100 bg-violet-50/60 px-5 py-3">
            <UserCheck size={15} className="text-violet-600" />
            <h2 className="text-sm font-semibold text-violet-900">
              Approval requests <span className="font-normal text-violet-500">· {pendingUsers.length} waiting</span>
            </h2>
          </div>
          <ul className="divide-y divide-gray-50">
            {pendingUsers.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-gray-400">{u.email} · requested {fmtDate(u.createdAt)}</p>
                </div>
                <Badge color="violet">wants {(u.requestedRole ?? "STAFF").toLowerCase()}</Badge>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={pending} onClick={() => decide(u.id, true)}
                    className="!py-1.5 text-emerald-700 ring-emerald-300 hover:bg-emerald-50">
                    <Check size={14} /> Approve
                  </Button>
                  <Button variant="ghost" disabled={pending} onClick={() => decide(u.id, false)}
                    className="!py-1.5 text-red-600 hover:bg-red-50">
                    <X size={14} /> Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={15} /> Users &amp; role-based access</h2>
          {!disabled && <Button variant="secondary" onClick={() => setInviting(true)}><Plus size={14} /> Add user</Button>}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3 font-medium">User</th>
              <th className="px-2 py-3 font-medium">Role</th>
              <th className="px-2 py-3 font-medium">Joined</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {activeUsers.map((u) => (
              <tr key={u.id}>
                <td className="px-5 py-2.5">
                  <p className="font-medium">{u.name} {u.id === meId && <span className="text-xs text-gray-400">(you)</span>}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </td>
                <td className="px-2 py-2.5">
                  {disabled || u.id === meId ? (
                    <Badge color={u.role === "ADMIN" ? "violet" : u.role === "MANAGER" ? "blue" : "gray"}>{u.role.toLowerCase()}</Badge>
                  ) : (
                    <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value as UserRow["role"])}
                      className="rounded-lg bg-gray-100 px-2 py-1 text-xs outline-none ring-brand-500 focus:ring-2 cursor-pointer">
                      {["ADMIN", "MANAGER", "STAFF"].map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-2 py-2.5 text-gray-500">{fmtDate(u.createdAt)}</td>
                <td className="px-2 py-2.5 text-right">
                  {!disabled && u.id !== meId && (
                    <button onClick={() => setConfirmingDelete(u)} className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 cursor-pointer">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-400">
          Roles: <span className="font-medium">admin</span> manages settings &amp; users · <span className="font-medium">manager</span> manages catalog &amp; categories · <span className="font-medium">staff</span> handles day-to-day operations.
        </p>
        {inviting && <InviteModal onClose={() => setInviting(false)} />}
        {confirmingDelete && (
          <ConfirmDialog
            title={`Delete ${confirmingDelete.name}?`}
            message={`${confirmingDelete.email} will lose access immediately. This cannot be undone.`}
            onConfirm={() => startTransition(async () => {
              const res = await deleteUser(confirmingDelete.id);
              if (res?.error) toast("error", res.error);
              else { toast("success", "User deleted"); router.refresh(); }
            })}
            onClose={() => setConfirmingDelete(null)}
          />
        )}
      </Card>
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(createUser, undefined);
  useEffect(() => {
    if (state?.success) { toast("success", "User created"); onClose(); router.refresh(); }
  }, [state, onClose, router, toast]);
  return (
    <Modal title="Add user" onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <Field label="Full name"><input name="name" required className={inputCls} /></Field>
        <Field label="Email"><input name="email" type="email" required className={inputCls} /></Field>
        <Field label="Password (min 8 chars)"><input name="password" type="password" required minLength={8} className={inputCls} /></Field>
        <Field label="Role">
          <select name="role" defaultValue="STAFF" className={inputCls}>
            {["ADMIN", "MANAGER", "STAFF"].map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
          </select>
        </Field>
        <ErrorText>{state?.error}</ErrorText>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 size={15} className="animate-spin" />} Create user
          </Button>
        </div>
      </form>
    </Modal>
  );
}
