import { copy } from "@/shared/copy/es";
import { Card, Skeleton, SpaceBackground } from "@/shared/ui";

/** Mirrors the reveal card while the session and the attendee profile are read on the server. */
export default function SquadLoading() {
  return (
    <>
      <SpaceBackground />
      <main
        aria-busy="true"
        aria-label={copy.a11y.loadingLabel}
        className="px-space-4 pt-safe-space-8 pb-safe-space-8 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center"
      >
        <Card className="gap-space-6 flex flex-col">
          <div className="gap-space-3 flex items-center">
            <Skeleton className="size-[64px]" />
            <div className="gap-space-2 flex flex-1 flex-col">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          <div className="gap-space-2 flex flex-col">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="mx-auto h-[72px] w-[200px]" />
          <Skeleton className="h-14 w-full" />
        </Card>
      </main>
    </>
  );
}
