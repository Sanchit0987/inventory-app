import {
  ArrowLeftRight, BarChart3, Boxes, Contact, Package, ScanLine,
  Settings, ShoppingCart, Truck,
} from "lucide-react";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

const TOPICS = [
  { icon: Package, title: "Items", href: "/items", text: "Add, edit, import (CSV) and export your catalog. Click a price or reorder point in the table to edit it inline. Items used on orders are archived, not deleted." },
  { icon: Boxes, title: "Inventory", href: "/inventory", text: "Stock overview shows on-hand, reserved (open sales orders) and incoming (open POs) per warehouse. Adjust stock with a reason, set bin locations inline, and transfer between warehouses atomically." },
  { icon: Truck, title: "Purchases", href: "/purchases", text: "Create purchase orders, then receive goods fully or partially from the order page — stock increases only when goods are actually received. Bills become payable after receipt." },
  { icon: ShoppingCart, title: "Sales", href: "/sales", text: "Create sales orders, fulfil them to deduct stock, generate invoices with tax, and record returns which put goods back into stock." },
  { icon: Contact, title: "Contacts", href: "/contacts", text: "Customers and suppliers with outstanding balances. Open a contact for their complete order and payment history." },
  { icon: BarChart3, title: "Reports", href: "/reports", text: "Inventory valuation, sales vs purchases, fast/slow movers, low-stock and movement analytics. Every report respects the date and warehouse filters and exports to CSV." },
  { icon: ScanLine, title: "Barcode scanning", href: "/inventory?scan=1", text: "Use the Scan button (or quick-create menu) with a USB/Bluetooth scanner, or type a barcode/SKU to look up live stock by warehouse and bin." },
  { icon: ArrowLeftRight, title: "Keyboard shortcuts", href: "#", text: "Press / anywhere to jump to global search. Esc closes any dialog." },
  { icon: Settings, title: "Settings & roles", href: "/settings", text: "Company profile, warehouses, categories, units, taxes, preferences and user management. Admins manage settings; managers manage the catalog; staff run daily operations." },
];

export default function HelpPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Help & shortcuts"
        description="A quick tour of every module"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Help" }]}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TOPICS.map((t) => (
          <Card key={t.title} className="p-5">
            <Link href={t.href} className="group">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <t.icon size={17} />
              </div>
              <h2 className="text-sm font-semibold group-hover:text-brand-600">{t.title}</h2>
            </Link>
            <p className="mt-1 text-sm text-gray-500">{t.text}</p>
          </Card>
        ))}
      </div>
      <p className="text-center text-xs text-gray-400">
        Need access? Ask an administrator to invite you from Settings → Users &amp; roles, or sign up from the login page.
      </p>
    </div>
  );
}
