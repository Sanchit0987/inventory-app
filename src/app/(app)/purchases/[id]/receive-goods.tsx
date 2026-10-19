"use client";

import { Loader2, PackageCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelPurchaseOrder, receiveGoods } from "@/actions/purchases";
import { Button, Card, ErrorText } from "@/components/ui";

export default function ReceiveGoods({
  poId,
  lines,
}: {
  poId: string;
  lines: { id: string; productName: string; sku: string; outstanding: number }[];
}) {
  const router = useRouter();
  const open = lines.filter((l) => l.outstanding > 0);
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(open.map((l) => [l.id, l.outstanding]))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const res = await receiveGoods(poId, qty);
      if (res?.error) setError(res.error);
      else router.refresh();
    });

  const cancel = () =>
    startTransition(async () => {
      setError(null);
      const res = await cancelPurchaseOrder(poId);
      if (res?.error) setError(res.error);
      else router.refresh();
    });

  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <PackageCheck size={16} className="text-emerald-600" /> Receive goods
      </h2>
      <p className="mb-4 text-xs text-gray-500">
        Enter received quantities (pre-filled with outstanding amounts) — stock is added to the destination warehouse.
      </p>
      <div className="space-y-2">
        {open.map((l) => (
          <div key={l.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.productName}</p>
              <p className="font-mono text-xs text-gray-400">{l.sku} · {l.outstanding} outstanding</p>
            </div>
            <input
              type="number"
              min={0}
              max={l.outstanding}
              value={qty[l.id] ?? 0}
              onChange={(e) => setQty({ ...qty, [l.id]: Math.max(0, Math.min(l.outstanding, Number(e.target.value))) })}
              className="w-24 rounded-lg border-0 px-3 py-2 text-right text-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
        ))}
      </div>
      {error && <div className="mt-3"><ErrorText>{error}</ErrorText></div>}
      <div className="mt-4 flex justify-between gap-2 border-t border-gray-100 pt-4">
        <Button variant="ghost" onClick={cancel} disabled={pending} className="text-red-600 hover:bg-red-50">
          <XCircle size={15} /> Cancel order
        </Button>
        <Button onClick={submit} disabled={pending || Object.values(qty).every((v) => !v)}>
          {pending && <Loader2 size={15} className="animate-spin" />} Receive items
        </Button>
      </div>
    </Card>
  );
}
