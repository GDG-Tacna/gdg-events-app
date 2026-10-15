import { copy } from "@/shared/copy/es";
import { Card, Skeleton } from "@/shared/ui";

/** Mirrors the list and the create form while the checkpoints are read on the server. */
export default function AdminCheckpointsLoading() {
  return (
    <div aria-busy="true" aria-label={copy.a11y.loadingLabel} className="gap-space-6 flex flex-col">
      <div className="gap-space-2 flex flex-col">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-72" />
      </div>
      <Card className="gap-space-4 flex flex-col">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </Card>
      <Card className="gap-space-4 flex flex-col">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-14 w-full" />
      </Card>
    </div>
  );
}
