import { Skeleton } from "@/components/ui/callout";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
