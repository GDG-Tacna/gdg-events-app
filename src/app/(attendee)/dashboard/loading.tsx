import { copy } from "@/shared/copy/es";
import { Card, Skeleton, SpaceBackground } from "@/shared/ui";

/** Mirrors the dashboard (attendee card, welcome and squad invitation) while the session and profile load. */
export default function DashboardLoading() {
  return (
    <>
      <SpaceBackground />
      <main
        aria-busy="true"
        aria-label={copy.a11y.loadingLabel}
        className="px-space-4 pt-safe-space-8 pb-safe-space-8 mx-auto w-full max-w-[520px] min-[760px]:max-w-[960px]"
      >
        <div className="gap-space-6 flex flex-col">
          <header className="gap-space-4 flex flex-col">
            <div className="gap-space-3 flex items-center">
              <Skeleton className="size-[64px]" />
              <div className="gap-space-2 flex flex-1 flex-col">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-6 w-40" />
          </header>

          <div className="gap-space-4 grid min-[760px]:grid-cols-2 min-[760px]:items-start">
            <Card className="gap-space-5 flex flex-col">
              <div className="gap-space-4 flex items-center">
                <Skeleton className="size-[96px]" />
                <div className="gap-space-2 flex flex-1 flex-col">
                  <Skeleton className="h-6 w-2/3" />
                  <Skeleton className="h-7 w-32" />
                </div>
              </div>
              <div className="gap-space-2 flex flex-col">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="gap-space-4 grid grid-cols-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </Card>
            <div className="gap-space-4 flex flex-col">
              <Card className="gap-space-4 flex">
                <Skeleton className="size-[64px] shrink-0" />
                <div className="gap-space-2 flex flex-1 flex-col">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </Card>
            </div>
          </div>

          <Skeleton className="h-12 w-full" />
        </div>
      </main>
    </>
  );
}
