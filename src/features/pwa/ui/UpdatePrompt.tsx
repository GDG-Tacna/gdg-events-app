"use client";

import { copy } from "@/shared/copy/es";
import { Button, Card, Icon } from "@/shared/ui";
import { usePwa } from "./pwa-context";

/**
 * "A new version is ready", at the bottom of the screen. It never swaps the version by itself: the
 * user decides when, so nothing changes under their hands. It is announced politely to screen readers.
 */
export function UpdatePrompt() {
  const { updateStatus, updateFailed, applyUpdate } = usePwa();
  if (updateStatus === "none") return null;

  const applying = updateStatus === "applying";

  return (
    <div className="pb-safe px-space-4 pointer-events-none fixed inset-x-0 bottom-0 z-50 pb-space-4">
      <Card
        role="status"
        aria-live="polite"
        className="gap-space-3 pointer-events-auto mx-auto flex w-full max-w-[520px] items-center"
        pad={false}
      >
        <div className="gap-space-3 p-space-4 flex w-full items-center">
          <Icon name="refresh" className="text-primary" />
          <div className="min-w-0 flex-1">
            <p className="type-heading text-foreground">{copy.pwa.updateTitle}</p>
            <p className="type-body-sm text-muted-foreground">
              {updateFailed ? copy.pwa.updateFailed : copy.pwa.updateBody}
            </p>
          </div>
          <Button size="sm" loading={applying} onClick={() => void applyUpdate()}>
            {applying ? copy.pwa.updating : copy.pwa.updateAction}
          </Button>
        </div>
      </Card>
    </div>
  );
}
