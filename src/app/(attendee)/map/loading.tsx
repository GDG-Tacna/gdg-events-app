import { copy } from "@/shared/copy/es";
import { Skeleton, SpaceBackground } from "@/shared/ui";

/** Mirrors the map: title, the portrait plan and the first quadrant cards. */
export default function MapLoading() {
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
          <Skeleton className="mx-auto aspect-[5/7] w-full max-w-[420px]" />
          <Skeleton className="h-24 w-full" />
        </div>
      </main>
    </>
  );
}
