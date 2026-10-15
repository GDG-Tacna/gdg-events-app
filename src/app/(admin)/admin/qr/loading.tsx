import { copy } from "@/shared/copy/es";
import { Card, Skeleton } from "@/shared/ui";

/** Mirrors the list of talks while it is read on the server. */
export default function AdminQrLoading() {
  return (
    <div aria-busy="true" aria-label={copy.a11y.loadingLabel} className="gap-space-6 flex flex-col">
      <div className="gap-space-2 flex flex-col">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="gap-space-4 grid grid-cols-1 min-[760px]:grid-cols-2">
        <Card className="gap-space-4 flex flex-col">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-12 w-full" />
        </Card>
        <Card className="gap-space-4 flex flex-col">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-12 w-full" />
        </Card>
      </div>
    </div>
  );
}
