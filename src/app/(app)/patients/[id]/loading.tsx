import { Skeleton } from "@/components/Skeleton";

const CARD = "rounded-2xl border border-slate-200 bg-white p-5";

export default function Loading() {
  return (
    <div className="-mt-2 flex flex-col gap-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="mt-2 flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24" />
          ))}
        </div>
      </div>
      <div className={CARD}>
        <Skeleton className="h-12 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className={CARD}>
          <Skeleton className="h-48 w-full" />
        </div>
        <div className={CARD}>
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
      <div className={CARD}>
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
