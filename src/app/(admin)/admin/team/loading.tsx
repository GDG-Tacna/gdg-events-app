import { copy } from "@/shared/copy/es";
import { Card, Skeleton } from "@/shared/ui";

/** Mirrors the team list and the grant form while the team is read on the server. */
export default function AdminTeamLoading() {
  return (
    <div aria-busy="true" aria-label={copy.a11y.loadingLabel} className="gap-space-6 flex flex-col">
      <div className="gap-space-2 flex flex-col">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-64" />
      </div>
      <Card className="gap-space-4 flex flex-col">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </Card>
      <Card className="gap-space-4 flex flex-col">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-14 w-full" />
      </Card>
    </div>
  );
}
