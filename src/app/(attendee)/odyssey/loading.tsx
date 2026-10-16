import { copy } from "@/shared/copy/es";
import { Skeleton, SpaceBackground } from "@/shared/ui";

/** Mirrors the log: title, the progress card and the first transmissions. */
export default function OdysseyLoading() {
  return (
    <>
      <SpaceBackground />
      <main
        aria-busy="true"
        aria-label={copy.a11y.loadingLabel}
        className="px-space-4 pt-safe-space-6 pb-space-6 mx-auto w-full max-w-[520px]"
      >
        <div className="gap-space-4 flex flex-col">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </main>
    </>
  );
}
