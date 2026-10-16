"use client";

import { copy } from "@/shared/copy/es";
import { Icon } from "@/shared/ui";
import { usePwa } from "./pwa-context";

/** A strip at the top while the device has no network. It disappears by itself when the connection returns. */
export function OfflineBanner() {
  const { online } = usePwa();
  if (online) return null;

  return (
    <div
      role="status"
      data-offline-banner
      aria-live="polite"
      className="bg-surface-raised border-line-strong px-space-4 pt-safe-space-2 pb-space-2 fixed inset-x-0 top-0 z-50 border-b"
    >
      <div className="gap-space-3 mx-auto flex w-full max-w-[520px] items-center">
        <Icon name="wifi-off" size={20} className="text-gold" />
        <p className="type-body-sm text-foreground">
          <span className="font-semibold">{copy.pwa.offlineTitle}.</span> {copy.pwa.offlineBody}
        </p>
      </div>
    </div>
  );
}
