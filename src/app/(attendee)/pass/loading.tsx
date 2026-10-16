import { copy } from "@/shared/copy/es";
import { Card, Skeleton, SpaceBackground } from "@/shared/ui";

/** Mirrors the pass card while the session is read on the server. */
export default function PassLoading() {
  return (
    <>
      <SpaceBackground />
      <main
        aria-busy="true"
        aria-label={copy.a11y.loadingLabel}
        className="px-space-4 pt-safe-space-6 pb-space-6 mx-auto w-full max-w-[520px]"
      >
        <div className="gap-space-4 flex flex-col">
          <Skeleton className="h-8 w-40" />
          <Card>
            <Skeleton className="aspect-square w-full" />
          </Card>
        </div>
      </main>
    </>
  );
}
