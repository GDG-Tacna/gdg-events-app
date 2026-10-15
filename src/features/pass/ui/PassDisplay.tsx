"use client";

import { QrCodeSvg, useRenewingCode } from "@/features/ephemeral-qr";
import { copy } from "@/shared/copy/es";
import { Button, Card, InlineAlert, Skeleton } from "@/shared/ui";
import type { PassErrorCode } from "../domain/pass-error";
import type { IssuePassAction, PassView } from "./action";
import { useCallback } from "react";

export interface PassDisplayProps {
  issue: IssuePassAction;
}

/**
 * The attendee's own pass, to show to staff: a big code that renews itself before it ends. Everything about
 * the code comes from the server (who it is for, how long it lasts); this only draws it. It never shows a
 * dead code: when one ends without a new one it says so.
 */
export function PassDisplay({ issue }: PassDisplayProps) {
  const request = useCallback(async () => {
    const result = await issue();
    return result.ok ? ({ ok: true, value: result.pass } as const) : result;
  }, [issue]);
  const { state, retry } = useRenewingCode<PassView, PassErrorCode>(request, "unknown");

  return (
    <div className="gap-space-5 mx-auto flex w-full max-w-[520px] flex-col items-center text-center">
      <header className="gap-space-1 flex flex-col">
        <h1 className="type-title-xl text-foreground">{copy.pass.title}</h1>
        <p className="type-body text-muted-foreground">{copy.pass.subtitle}</p>
      </header>

      <Card className="gap-space-4 flex w-full flex-col items-center">
        {state.status === "showing" ? (
          <>
            <QrCodeSvg cells={state.code.cells} label={copy.pass.codeLabel} className="aspect-square w-full max-w-[420px] rounded-md" />
            <p className="type-body-sm text-text-subtle">{copy.pass.renews}</p>
            {state.reconnecting ? <InlineAlert>{copy.pass.reconnecting}</InlineAlert> : null}
          </>
        ) : null}

        {state.status === "loading" ? (
          <div aria-busy="true" role="status" className="gap-space-4 flex w-full flex-col items-center">
            <Skeleton className="aspect-square w-full max-w-[420px]" />
            <p className="type-body text-muted-foreground">{copy.pass.loading}</p>
          </div>
        ) : null}

        {state.status === "expired" ? (
          <p role="status" className="type-body text-muted-foreground py-space-8">
            {copy.pass.expired}
          </p>
        ) : null}

        {state.status === "error" ? (
          <div className="gap-space-4 flex w-full flex-col">
            <InlineAlert>{copy.pass.errors[state.code]}</InlineAlert>
            <Button variant="secondary" onClick={retry}>
              {copy.pass.retry}
            </Button>
          </div>
        ) : null}
      </Card>

      <p className="type-body-sm text-muted-foreground">{copy.pass.brightness}</p>
    </div>
  );
}
