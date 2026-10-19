"use client";

import {
  ArrowLeftRight, Bell, Check, ChevronDown, HelpCircle, LogOut, Menu,
  PackagePlus, Plus, ScanLine, Search, ShoppingCart, SlidersHorizontal,
  Truck, Warehouse as WarehouseIcon, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { logout } from "@/actions/auth";
import { markNotificationsRead } from "@/actions/settings";
import { timeAgo } from "@/lib/format";
import { Badge, cls, statusColor } from "../ui";

type SearchResult = { type: string; id: string; title: string; subtitle: string; href: string };
type Notif = { id: string; type: string; title: string; message: string; read: boolean; link: string | null; createdAt: string };
type Wh = { id: string; code: string; name: string };

/* Quick-create menu entries (wireframe: global + button) */
const QUICK_CREATE = [
  { label: "New item", href: "/items?new=1", icon: PackagePlus },
  { label: "New sales order", href: "/sales?tab=orders&new=so", icon: ShoppingCart },
  { label: "New purchase order", href: "/purchases?tab=orders&new=po", icon: Truck },
  { label: "Stock adjustment", href: "/inventory?tab=stock", icon: SlidersHorizontal },
  { label: "Stock transfer", href: "/inventory?tab=transfers&new=transfer", icon: ArrowLeftRight },
  { label: "Scan barcode", href: "/inventory?tab=stock&scan=1", icon: ScanLine },
];

export default function Topbar({
  user, notifications, warehouses, onMobileMenu,
}: {
  user: { name: string; role: string };
  notifications: Notif[];
  warehouses: Wh[];
  onMobileMenu: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [openMenu, setOpenMenu] = useState<"" | "search" | "notif" | "create" | "wh" | "profile">("");
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.read);
  const activeWh = params.get("wh") ?? "all";

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        (document.getElementById("global-search") as HTMLInputElement)?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenMenu("");
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const search = useCallback((value: string) => {
    setQ(value);
    if (!value.trim()) { setResults(null); return; }
    fetch(`/api/search?q=${encodeURIComponent(value)}`)
      .then((r) => r.json())
      .then((data) => setResults(data.results))
      .catch(() => setResults([]));
  }, []);

  const pickWarehouse = (id: string) => {
    setOpenMenu("");
    const sp = new URLSearchParams(params.toString());
    if (id === "all") sp.delete("wh"); else sp.set("wh", id);
    router.push(`${pathname}?${sp.toString()}`);
  };

  return (
    <header ref={rootRef} className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-gray-200 bg-white/80 px-3 backdrop-blur md:px-6">
      {/* mobile hamburger */}
      <button onClick={onMobileMenu} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 md:hidden cursor-pointer">
        <Menu size={18} />
      </button>

      {/* Warehouse selector */}
      <div className="relative hidden sm:block">
        <button onClick={() => setOpenMenu(openMenu === "wh" ? "" : "wh")}
          aria-label="Warehouse selector"
          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer">
          <WarehouseIcon size={15} className="text-gray-400" />
          <span className="max-w-32 truncate">
            {activeWh === "all" ? "All warehouses" : warehouses.find((w) => w.id === activeWh)?.name ?? "All warehouses"}
          </span>
          <ChevronDown size={13} className="text-gray-400" />
        </button>
        {openMenu === "wh" && (
          <div className="absolute left-0 top-full mt-1 w-56 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-gray-900/10 animate-slide-up">
            <button onClick={() => pickWarehouse("all")}
              className={cls("block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50 cursor-pointer", activeWh === "all" && "bg-brand-50 text-brand-700 font-medium")}>
              All warehouses
            </button>
            {warehouses.map((w) => (
              <button key={w.id} onClick={() => pickWarehouse(w.id)}
                className={cls("block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50 cursor-pointer", activeWh === w.id && "bg-brand-50 text-brand-700 font-medium")}>
                {w.name} <span className="font-mono text-xs text-gray-400">{w.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Global search */}
      <div className="relative min-w-0 flex-1 md:max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          id="global-search"
          value={q}
          onChange={(e) => { search(e.target.value); setOpenMenu("search"); }}
          onFocus={() => setOpenMenu("search")}
          placeholder="Search…  ( / )"
          className="w-full rounded-lg border-0 bg-gray-100 py-2 pl-9 pr-8 text-sm outline-none ring-brand-500 placeholder:text-gray-400 focus:bg-white focus:ring-2"
        />
        {q && (
          <button onClick={() => { setQ(""); setResults(null); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
            <X size={14} />
          </button>
        )}
        {openMenu === "search" && results && (
          <div className="absolute left-0 right-0 top-full mt-2 max-h-96 overflow-y-auto rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-gray-900/10 animate-slide-up">
            {results.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-gray-500">No matches for “{q}”</p>
            ) : (
              results.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => { setOpenMenu(""); setQ(""); setResults(null); router.push(r.href); }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-50 cursor-pointer"
                >
                  <Badge color={r.type === "Product" ? "blue" : r.type === "Customer" ? "violet" : r.type === "Supplier" ? "amber" : "gray"}>{r.type}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-gray-500">{r.subtitle}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* Quick create */}
        <div className="relative">
          <button onClick={() => setOpenMenu(openMenu === "create" ? "" : "create")}
            className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 cursor-pointer">
            <Plus size={16} /> <span className="hidden sm:inline">New</span>
            <ChevronDown size={13} className="opacity-70" />
          </button>
          {openMenu === "create" && (
            <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-gray-900/10 animate-slide-up">
              {QUICK_CREATE.map((item) => (
                <button key={item.href}
                  onClick={() => { setOpenMenu(""); router.push(item.href); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                  <item.icon size={15} className="text-gray-400" /> {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative">
          <button onClick={() => setOpenMenu(openMenu === "notif" ? "" : "notif")}
            aria-label="Notifications"
            className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 cursor-pointer">
            <Bell size={18} />
            {unread.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unread.length > 9 ? "9+" : unread.length}
              </span>
            )}
          </button>
          {openMenu === "notif" && (
            <div className="absolute right-0 top-full mt-2 w-[min(24rem,90vw)] rounded-xl bg-white shadow-xl ring-1 ring-gray-900/10 animate-slide-up">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <span className="text-sm font-semibold">Notifications</span>
                {unread.length > 0 && (
                  <button
                    onClick={() => startTransition(async () => { await markNotificationsRead(); router.refresh(); })}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer"
                  >
                    <Check size={13} /> Mark all read
                  </button>
                )}
              </div>
              <div className="scroll-thin max-h-96 overflow-y-auto p-1.5">
                {notifications.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-gray-500">You’re all caught up 🎉</p>
                ) : (
                  notifications.map((n) => (
                    <Link key={n.id} href={n.link ?? "#"} onClick={() => setOpenMenu("")}
                      className={cls("block rounded-lg px-3 py-2.5 hover:bg-gray-50", !n.read && "bg-brand-50/40")}>
                      <span className="flex items-center gap-2">
                        <Badge color={statusColor[n.type] ?? "gray"}>{n.type.replace(/_/g, " ").toLowerCase()}</Badge>
                        <span className="truncate text-sm font-medium text-gray-800">{n.title}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-gray-400">{timeAgo(n.createdAt)}</span>
                      </span>
                      <span className="mt-1 block text-sm text-gray-600">{n.message}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Help */}
        <Link href="/help" title="Help" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700">
          <HelpCircle size={18} />
        </Link>

        {/* Profile */}
        <div className="relative">
          <button onClick={() => setOpenMenu(openMenu === "profile" ? "" : "profile")}
            aria-label="Profile menu"
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-gray-100 cursor-pointer">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </div>
          </button>
          {openMenu === "profile" && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-gray-900/10 animate-slide-up">
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">{user.role.toLowerCase()}</p>
              </div>
              <Link href="/settings" onClick={() => setOpenMenu("")}
                className="mt-1 block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                Settings
              </Link>
              <form action={logout}>
                <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 cursor-pointer">
                  <LogOut size={14} /> Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
