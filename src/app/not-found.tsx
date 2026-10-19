import { PackageSearch } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
        <PackageSearch size={26} />
      </div>
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-gray-500">
        The page you’re looking for doesn’t exist or may have been moved.
      </p>
      <Link href="/dashboard"
        className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
        Back to dashboard
      </Link>
    </div>
  );
}
