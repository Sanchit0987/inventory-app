"use client";

import { useState } from "react";
import { ToastProvider } from "../ui";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

type Notif = { id: string; type: string; title: string; message: string; read: boolean; link: string | null; createdAt: string };
type Wh = { id: string; code: string; name: string };

export default function AppShell({
  orgName, user, notifications, warehouses, children,
}: {
  orgName: string;
  user: { name: string; role: string };
  notifications: Notif[];
  warehouses: Wh[];
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar orgName={orgName} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            user={user}
            notifications={notifications}
            warehouses={warehouses}
            onMobileMenu={() => setMobileOpen(true)}
          />
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
