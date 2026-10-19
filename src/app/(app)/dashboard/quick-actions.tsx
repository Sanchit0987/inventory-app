"use client";

import { ArrowLeftRight, PackagePlus, SlidersHorizontal, Truck, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

/* Quick actions per wireframe: Add Item, Stock Adjustment, New PO, Import Items */
export default function QuickActions() {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => router.push("/inventory?tab=stock")}>
        <SlidersHorizontal size={15} /> Adjust stock
      </Button>
      <Button variant="secondary" onClick={() => router.push("/inventory?tab=transfers&new=transfer")}>
        <ArrowLeftRight size={15} /> Transfer
      </Button>
      <Button variant="secondary" onClick={() => router.push("/purchases?tab=orders&new=po")}>
        <Truck size={15} /> New PO
      </Button>
      <Button variant="secondary" onClick={() => router.push("/items")}>
        <Upload size={15} /> Import items
      </Button>
      <Button onClick={() => router.push("/items?new=1")}>
        <PackagePlus size={15} /> Add item
      </Button>
    </div>
  );
}
