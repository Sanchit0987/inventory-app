"use client";

/* Shared UI primitives: badges, buttons, cards, modal, empty state,
   toasts, confirm dialog, breadcrumbs, pagination */

import { AlertTriangle, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import {
  ReactNode, createContext, useCallback, useContext, useEffect, useState,
} from "react";

export function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const badgeStyles: Record<string, string> = {
  // generic
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/25",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  gray: "bg-gray-100 text-gray-600 ring-gray-500/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

export const statusColor: Record<string, keyof typeof badgeStyles> = {
  DRAFT: "gray", ORDERED: "blue", PARTIAL: "amber", RECEIVED: "green", CANCELLED: "red",
  CONFIRMED: "blue", PACKED: "violet", SHIPPED: "amber", DELIVERED: "green",
  SENT: "blue", PAID: "green", OVERDUE: "red",
  IN_TRANSIT: "amber", COMPLETED: "green",
  LOW_STOCK: "amber", OUT_OF_STOCK: "red", ORDER_PENDING: "blue", ADMIN_APPROVAL: "violet", INFO: "gray",
  PENDING: "amber", ACTIVE: "green",
};

export function Badge({ color = "gray", children }: { color?: string; children: ReactNode }) {
  return (
    <span className={cls("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeStyles[color] ?? badgeStyles.gray)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge color={statusColor[status] ?? "gray"}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
    secondary: "bg-white text-gray-800 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 shadow-sm",
    ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
    danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  };
  return (
    <button
      className={cls(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cls("rounded-xl bg-white shadow-sm ring-1 ring-gray-900/5", className)}>
      {children}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 pt-[8vh] animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cls("w-full rounded-2xl bg-white p-6 shadow-2xl animate-slide-up", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="rounded-2xl bg-gray-100 p-4 text-gray-400">{icon}</div>
      <p className="mt-2 font-medium text-gray-700">{title}</p>
      {hint && <p className="max-w-sm text-sm text-gray-500">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-brand-500 outline-none";

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cls("block", className)}>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

/* ---------- Toasts ---------- */

type Toast = { id: number; kind: "success" | "error"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id}
            className={cls(
              "pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg animate-slide-up",
              t.kind === "success" ? "bg-emerald-600" : "bg-red-600"
            )}>
            {t.kind === "success" ? <Check size={15} /> : <AlertTriangle size={15} />}
            <span className="min-w-0 flex-1">{t.text}</span>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="cursor-pointer opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Confirm dialog for destructive actions ---------- */

export function ConfirmDialog({
  title, message, confirmLabel = "Delete", onConfirm, onClose,
}: {
  title: string; message: string; confirmLabel?: string;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-gray-600">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

/* ---------- Breadcrumbs ---------- */

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-gray-400">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={12} />}
          {item.href ? (
            <Link href={item.href} className="hover:text-gray-600">{item.label}</Link>
          ) : (
            <span className="text-gray-600">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/* ---------- Page header: title + description left, primary action right ---------- */

export function PageHeader({
  title, description, crumbs, actions,
}: {
  title: string; description?: string;
  crumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {crumbs && <Breadcrumbs items={crumbs} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {description && <p className="text-sm text-gray-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ---------- Client-side pagination ---------- */

export function usePagination<T>(rows: T[], pageSize = 25) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  return {
    rows: rows.slice(current * pageSize, (current + 1) * pageSize),
    page: current,
    pages,
    total: rows.length,
    setPage,
  };
}

export function Pagination({
  page, pages, total, onPage,
}: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 text-sm text-gray-500">
      <span>{total.toLocaleString()} rows · page {page + 1} of {pages}</span>
      <div className="flex gap-1">
        <button disabled={page === 0} onClick={() => onPage(page - 1)}
          className="rounded-lg p-1.5 hover:bg-gray-100 disabled:opacity-30 cursor-pointer"><ChevronLeft size={16} /></button>
        <button disabled={page >= pages - 1} onClick={() => onPage(page + 1)}
          className="rounded-lg p-1.5 hover:bg-gray-100 disabled:opacity-30 cursor-pointer"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

/* ---------- Sub-tab strip used by Inventory / Sales / Purchases / Contacts ---------- */

export function TabStrip<T extends string>({
  tabs, active, onChange,
}: {
  tabs: { id: T; label: string; icon?: React.ComponentType<{ size?: number | string; className?: string }> }[];
  active: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="scroll-thin flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cls(
            "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
            active === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800"
          )}>
          {t.icon && <t.icon size={15} />} {t.label}
        </button>
      ))}
    </div>
  );
}
