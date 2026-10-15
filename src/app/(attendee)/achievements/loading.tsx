import { copy } from "@/shared/copy/es";
import { Skeleton, SpaceBackground } from "@/shared/ui";

/** Mirrors the Logros tab: title, the summary card and the first badges. */
export default function AchievementsLoading() {
  return (
    <>
      <SpaceBackground />
      <main
        aria-busy="true"
        aria-label={copy.a11y.loadingLabel}
        className="pt-safe px-space-4 py-space-6 mx-auto w-full max-w-[520px]"
      >
        <div className="gap-space-4 flex flex-col">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </main>
    </>
  );
}
