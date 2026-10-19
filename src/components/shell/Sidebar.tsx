"use client";

import {
  ArrowLeftRight, BarChart3, Boxes, ChevronDown, ChevronLeft, Contact,
  LayoutDashboard, Package, Settings, ShoppingCart, Truck, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { cls } from "../ui";

/* Wireframe navigation: Dashboard, Items, Inventory, Sales, Purchases,
   Contacts, Reports, Settings — with expandable submenus. */
const NAV: {
  href: string; label: string; icon: typeof Package;
  sub?: { href: string; label: string }[];
}[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/items", label: "Items", icon: Package },
  {
    href: "/inventory", label: "Inventory", icon: Boxes,
    sub: [
      { href: "/inventory?tab=stock", label: "Stock overview" },
      { href: "/inventory?tab=warehouses", label: "Warehouses" },
      { href: "/inventory?tab=transfers", label: "Transfers" },
      { href: "/inventory?tab=adjustments", label: "Adjustments" },
      { href: "/inventory?tab=movements", label: "Movement history" },
    ],
  },
  {
    href: "/sales", label: "Sales", icon: ShoppingCart,
    sub: [
      { href: "/sales?tab=orders", label: "Sales orders" },
      { href: "/sales?tab=invoices", label: "Invoices" },
      { href: "/sales?tab=shipments", label: "Shipments" },
      { href: "/sales?tab=returns", label: "Returns" },
    ],
  },
  {
    href: "/purchases", label: "Purchases", icon: Truck,
    sub: [
      { href: "/purchases?tab=orders", label: "Purchase orders" },
      { href: "/purchases?tab=received", label: "Goods received" },
      { href: "/purchases?tab=bills", label: "Bills" },
      { href: "/purchases?tab=returns", label: "Returns" },
    ],
  },
  {
    href: "/contacts", label: "Contacts", icon: Contact,
    sub: [
      { href: "/contacts?tab=customers", label: "Customers" },
      { href: "/contacts?tab=suppliers", label: "Suppliers" },
    ],
  },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

/* localStorage-backed flags, hydration-safe */
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("sidebar-toggle", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("sidebar-toggle", cb);
  };
}
const getCollapsed = () => localStorage.getItem("sidebar-collapsed") === "1";
const getServer = () => false;
const getExpanded = () => localStorage.getItem("sidebar-expanded") ?? "";
const getServerExpanded = () => "";

export default function Sidebar({
  orgName, mobileOpen, onMobileClose,
}: {
  orgName: string; mobileOpen: boolean; onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, getCollapsed, getServer);
  const expandedKey = useSyncExternalStore(subscribe, getExpanded, getServerExpanded);

  const toggle = () => {
    localStorage.setItem("sidebar-collapsed", collapsed ? "0" : "1");
    window.dispatchEvent(new Event("sidebar-toggle"));
  };
  const setExpanded = (href: string) => {
    localStorage.setItem("sidebar-expanded", expandedKey === href ? "" : href);
    window.dispatchEvent(new Event("sidebar-toggle"));
  };

  // close the mobile drawer on navigation
  useEffect(() => { onMobileClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const nav = (
    <>
      <div className={cls("flex h-14 items-center gap-2 border-b border-gray-100", collapsed ? "justify-center px-0" : "px-4")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          <ArrowLeftRight size={16} />
        </div>
        {!collapsed && <span className="truncate text-sm font-semibold">{orgName}</span>}
        <button onClick={onMobileClose} className="ml-auto rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 md:hidden cursor-pointer">
          <X size={16} />
        </button>
      </div>

      <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map(({ href, label, icon: Icon, sub }) => {
          const active = pathname.startsWith(href);
          const isExpanded = expandedKey === href && !collapsed;
          return (
            <div key={href}>
              <div className={cls(
                "flex items-center rounded-lg transition-colors",
                active ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}>
                <Link
                  href={href}
                  title={collapsed ? label : undefined}
                  className={cls(
                    "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                    collapsed && "justify-center px-0"
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
                {sub && !collapsed && (
                  <button
                    onClick={() => setExpanded(href)}
                    aria-label={`Toggle ${label} submenu`}
                    className="mr-1 rounded p-1 text-gray-400 hover:bg-black/5 cursor-pointer"
                  >
                    <ChevronDown size={14} className={cls("transition-transform", isExpanded && "rotate-180")} />
                  </button>
                )}
              </div>
              {sub && isExpanded && (
                <div className="ml-6 mt-0.5 space-y-0.5 border-l border-gray-100 pl-3 animate-fade-in">
                  {sub.map((s) => (
                    <Link key={s.href} href={s.href}
                      className="block rounded-lg px-2 py-1.5 text-[13px] text-gray-500 hover:bg-gray-50 hover:text-gray-800">
                      {s.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <button
        onClick={toggle}
        className="hidden items-center justify-center gap-2 border-t border-gray-100 py-3 text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600 md:flex cursor-pointer"
      >
        <ChevronLeft size={16} className={cls("transition-transform", collapsed && "rotate-180")} />
        {!collapsed && "Collapse"}
      </button>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={cls(
        "sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-gray-200 bg-white transition-all duration-200 md:flex",
        collapsed ? "w-[60px]" : "w-[232px]"
      )}>
        {nav}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={onMobileClose}>
          <div className="absolute inset-0 bg-gray-900/40 animate-fade-in" />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-0 flex h-full w-[260px] flex-col bg-white shadow-2xl animate-slide-up"
          >
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
