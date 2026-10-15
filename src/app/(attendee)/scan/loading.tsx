import { copy } from "@/shared/copy/es";
import { Skeleton, SpaceBackground } from "@/shared/ui";

/** Mirrors the camera frame while the session is read on the server. */
export default function ScanLoading() {
  return (
    <>
      <SpaceBackground />
      <main
        aria-busy="true"
        aria-label={copy.a11y.loadingLabel}
        className="pt-safe px-space-4 py-space-6 mx-auto w-full max-w-[520px]"
      >
        <div className="gap-space-4 flex flex-col">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="aspect-[3/4] w-full" />
        </div>
      </main>
    </>
  );
}
