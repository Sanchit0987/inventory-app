/* Route-level loading skeleton shown while server components fetch */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="space-y-2">
        <div className="h-3 w-40 rounded bg-gray-200/70" />
        <div className="h-6 w-56 rounded bg-gray-200" />
        <div className="h-3 w-72 rounded bg-gray-200/70" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-white shadow-sm ring-1 ring-gray-900/5">
            <div className="space-y-2 p-4">
              <div className="h-3 w-20 rounded bg-gray-200/70" />
              <div className="h-5 w-28 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-72 rounded-xl bg-white shadow-sm ring-1 ring-gray-900/5">
        <div className="space-y-3 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 rounded bg-gray-100" style={{ width: `${90 - i * 7}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
