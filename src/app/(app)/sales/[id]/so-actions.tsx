"use client";

import { CheckCircle2, FileText, Loader2, PackageCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelSalesOrder, createInvoice, fulfillSalesOrder, markDelivered } from "@/actions/sales";
import { Button, Card, ErrorText } from "@/components/ui";

export default function SoActions({
  soId, status, isReturn, hasInvoice,
}: {
  soId: string; status: string; isReturn: boolean; hasInvoice: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (isReturn || status === "CANCELLED") return null;

  const run = (fn: () => Promise<{ error?: string } | undefined>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) setError(res.error);
      else router.refresh();
    });

  const canFulfill = status === "CONFIRMED" || status === "PACKED";
  const canDeliver = status === "SHIPPED";
  const canInvoice = !hasInvoice && status !== "DRAFT";
  const canCancel = canFulfill;

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold">Order actions</h2>
      {error && <div className="mb-3"><ErrorText>{error}</ErrorText></div>}
      <div className="flex flex-wrap gap-2">
        {canFulfill && (
          <Button onClick={() => run(() => fulfillSalesOrder(soId))} disabled={pending}>
            {pending ? <Loader2 size={15} className="animate-spin" /> : <PackageCheck size={15} />}
            Fulfil &amp; ship
          </Button>
        )}
        {canDeliver && (
          <Button onClick={() => run(() => markDelivered(soId))} disabled={pending}>
            {pending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            Mark delivered
          </Button>
        )}
        {canInvoice && (
          <Button variant="secondary" onClick={() => run(() => createInvoice(soId))} disabled={pending}>
            <FileText size={15} /> Generate invoice
          </Button>
        )}
        {canCancel && (
          <Button variant="ghost" onClick={() => run(() => cancelSalesOrder(soId))} disabled={pending} className="text-red-600 hover:bg-red-50">
            <XCircle size={15} /> Cancel order
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-400">
        Fulfilment deducts stock from the order’s warehouse and records SALE_SHIPMENT movements.
      </p>
    </Card>
  );
}
