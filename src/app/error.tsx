"use client";

import { copy } from "@/shared/copy/es";
import { Button, Card, SpaceBackground } from "@/shared/ui";

/** Route-level error boundary: a calm message and a retry, never a stack trace. */
export default function RouteError({ reset }: { reset: () => void }) {
  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-8 pb-safe-space-8 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center">
        <Card role="alert" className="gap-space-4 flex flex-col">
          <h1 className="type-title text-foreground">{copy.system.errorTitle}</h1>
          <p className="type-body text-muted-foreground">{copy.system.errorDescription}</p>
          <Button block onClick={reset}>
            {copy.system.retry}
          </Button>
        </Card>
      </main>
    </>
  );
}
