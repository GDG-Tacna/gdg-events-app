"use client";

import { copy } from "@/shared/copy/es";
import { Card, Icon } from "@/shared/ui";
import { usePwa } from "./pwa-context";
import { usePersistedFlag } from "./use-persisted-flag";

const DISMISSED_KEY = "devfest.install-hint.dismissed";

/**
 * How to install the app on an iPhone or iPad. Safari has no install prompt, so this is the only help
 * those users get. It shows only in Safari on iOS, only before the app is on the home screen, and
 * stays away once dismissed.
 */
export function InstallHint() {
  const { showIosInstallHint } = usePwa();
  const [dismissed, dismiss] = usePersistedFlag(DISMISSED_KEY);

  if (!showIosInstallHint || dismissed) return null;

  return (
    <Card role="region" aria-label={copy.pwa.installTitle} className="gap-space-3 flex flex-col">
      <div className="gap-space-3 flex items-start justify-between">
        <h2 className="type-heading text-foreground">{copy.pwa.installTitle}</h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label={copy.pwa.installDismiss}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -m-space-2 rounded-md p-space-2 focus-visible:ring-[3px] focus-visible:outline-none"
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <p className="type-body-sm text-muted-foreground">{copy.pwa.installIntro}</p>
      <ol className="gap-space-2 flex flex-col">
        <li className="gap-space-3 type-body-sm text-foreground flex items-center">
          <Icon name="share" size={20} className="text-primary" />
          {copy.pwa.installStepShare}
        </li>
        <li className="gap-space-3 type-body-sm text-foreground flex items-center">
          <Icon name="plus-square" size={20} className="text-primary" />
          {copy.pwa.installStepAdd}
        </li>
      </ol>
    </Card>
  );
}
