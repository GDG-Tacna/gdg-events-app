import { copy } from "@/shared/copy/es";
import { Card, Skeleton, SpaceBackground } from "@/shared/ui";

/** Mirrors the Red (title, tabs and the code card) while the contacts are read on the server. */
export default function NetworkLoading() {
  return (
    <>
      <SpaceBackground />
      <main aria-busy="true" aria-label={copy.a11y.loadingLabel} className="pt-safe px-space-4 py-space-6 mx-auto w-full max-w-[520px]">
        <div className="gap-space-4 flex flex-col">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-14 w-full" />
          <Card>
            <Skeleton className="aspect-square w-full" />
          </Card>
        </div>
      </main>
    </>
  );
}
