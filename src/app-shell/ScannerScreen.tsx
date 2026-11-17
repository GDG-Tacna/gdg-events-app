"use client";

import { recordCheckInAction } from "@/app-shell/checkins/record-check-in.action";
import type { ScanContact } from "@/features/checkins";
import { CadetCardView } from "@/features/network";
import { QrCodeCamera, ScannerView } from "@/features/scanner";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";

/** The other cadet's card and what the contact paid: the scanner draws it with the network feature's own card. */
function renderContact({ card, xpEarned, creditsEarned, capReached }: ScanContact) {
  return (
    <>
      <CadetCardView card={card} className="bg-surface-raised border-border p-space-4 rounded-md border" />
      {xpEarned + creditsEarned > 0 ? (
        <p className="type-pixel-tag text-accent gap-space-3 flex flex-wrap">
          {xpEarned > 0 ? <span>{interpolate(copy.network.xp, { n: formatNumber(xpEarned) })}</span> : null}
          {creditsEarned > 0 ? <span className="text-gold">{interpolate(copy.network.credits, { n: formatNumber(creditsEarned) })}</span> : null}
        </p>
      ) : null}
      {capReached ? <p className="type-body-sm text-muted-foreground">{copy.network.scan.capReached}</p> : null}
    </>
  );
}

/**
 * The scanner bound to the real camera and the real server action. It lives in the app shell because it
 * is the one place that knows both: the page (server) cannot create a camera, and the feature does not
 * know which server action records a check-in. The page says which modules are on (it reads them on the server).
 */
export function ScannerScreen({ achievementsOn, networkOn, missionsOn }: { achievementsOn: boolean; networkOn: boolean; missionsOn: boolean }) {
  return (
    <ScannerView
      camera={QrCodeCamera}
      record={recordCheckInAction}
      homeHref={ROUTES.dashboard}
      achievementsHref={achievementsOn ? ROUTES.achievements : undefined}
      networkHref={networkOn ? ROUTES.network : undefined}
      passHref={ROUTES.pass}
      missionsHref={missionsOn ? ROUTES.missions : undefined}
      renderContact={renderContact}
    />
  );
}
