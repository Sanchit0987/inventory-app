"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // server logs carry the full stack; the client only sees the digest
    console.error("App error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
        <AlertTriangle size={26} />
      </div>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-gray-500">
        The error has been logged{error.digest ? ` (ref ${error.digest})` : ""}. Try again, or go back to the dashboard.
      </p>
      <div className="mt-2 flex gap-2">
        <button onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 cursor-pointer">
          <RotateCcw size={15} /> Try again
        </button>
        <a href="/dashboard"
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
          Dashboard
        </a>
      </div>
    </div>
  );
}
