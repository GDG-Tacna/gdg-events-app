"use client";

import { useCallback } from "react";
import { QrCodeSvg, useRenewingCode } from "@/features/ephemeral-qr";
import { copy } from "@/shared/copy/es";
import { Button, InlineAlert, Skeleton } from "@/shared/ui";
import type { NetworkErrorCode } from "../domain/network";
import type { ContactCodeView, IssueContactCodeAction } from "./actions";

/**
 * The cadet's own contact code, for another cadet to scan: a big code that renews itself before it ends. Who it
 * is for and how long it lasts come from the server; this only draws it, and never shows a dead code.
 */
export function ContactCode({ issue }: { issue: IssueContactCodeAction }) {
  const t = copy.network.code;
  const request = useCallback(async () => {
    const result = await issue();
    return result.ok ? ({ ok: true, value: result.code } as const) : result;
  }, [issue]);
  const { state, retry } = useRenewingCode<ContactCodeView, NetworkErrorCode>(request, "unknown");

  return (
    <div className="gap-space-4 flex w-full flex-col items-center text-center">
      {state.status === "showing" ? (
        <>
          <QrCodeSvg cells={state.code.cells} label={t.label} className="aspect-square w-full max-w-[360px] rounded-md" />
          <p className="type-body-sm text-text-subtle">{t.renews}</p>
          {state.reconnecting ? <InlineAlert>{t.reconnecting}</InlineAlert> : null}
        </>
      ) : null}

      {state.status === "loading" ? (
        <div aria-busy="true" role="status" className="gap-space-4 flex w-full flex-col items-center">
          <Skeleton className="aspect-square w-full max-w-[360px]" />
          <p className="type-body text-muted-foreground">{t.loading}</p>
        </div>
      ) : null}

      {state.status === "expired" ? (
        <p role="status" className="type-body text-muted-foreground py-space-8">
          {t.expired}
        </p>
      ) : null}

      {state.status === "error" ? (
        <div className="gap-space-4 flex w-full flex-col">
          <InlineAlert>{copy.network.errors[state.code].body}</InlineAlert>
          <Button variant="secondary" onClick={retry}>
            {t.retry}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
