import { Card } from "@/components/ui";
import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 gap-px bg-slate-100 p-px">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[100px] bg-white p-1.5">
              <Skeleton className="h-6 w-6 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
