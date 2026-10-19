"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cls } from "@/components/ui";

const OPTIONS = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

export default function DateFilter({ current }: { current: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const pick = (id: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("range", id);
    router.push(`/dashboard?${sp.toString()}`);
  };
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5">
      {OPTIONS.map((o) => (
        <button key={o.id} onClick={() => pick(o.id)}
          className={cls(
            "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
            current === o.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
          )}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
