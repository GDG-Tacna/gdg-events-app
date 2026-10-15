import { copy } from "@/shared/copy/es";
import { Card, Skeleton, SpaceBackground } from "@/shared/ui";

/** Mirrors the shape of the sign-in card while the session is verified on the server. */
export default function LoginLoading() {
  return (
    <>
      <SpaceBackground />
      <main
        aria-busy="true"
        aria-label={copy.a11y.loadingLabel}
        className="pt-safe pb-safe px-space-4 py-space-8 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center"
      >
        <Card className="gap-space-6 flex flex-col">
          <div className="gap-space-3 flex items-center">
            <Skeleton className="size-[64px]" />
            <div className="gap-space-2 flex flex-1 flex-col">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          <Skeleton className="mx-auto h-[60px] w-[112px]" />
          <div className="gap-space-2 flex flex-col">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="h-14 w-full" />
        </Card>
      </main>
    </>
  );
}
