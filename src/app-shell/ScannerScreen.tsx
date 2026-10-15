"use client";

import { recordCheckInAction } from "@/app-shell/checkins/record-check-in.action";
import { QrCodeCamera, ScannerView } from "@/features/scanner";
import { ROUTES } from "@/shared/config/routes";

/**
 * The scanner bound to the real camera and the real server action. It lives in the app shell because it
 * is the one place that knows both: the page (server) cannot create a camera, and the feature does not
 * know which server action records a check-in. The page says which modules are on (it reads them on the server).
 */
export function ScannerScreen({ achievementsOn, networkOn }: { achievementsOn: boolean; networkOn: boolean }) {
  return (
    <ScannerView
      camera={QrCodeCamera}
      record={recordCheckInAction}
      homeHref={ROUTES.dashboard}
      achievementsHref={achievementsOn ? ROUTES.achievements : undefined}
      networkHref={networkOn ? ROUTES.network : undefined}
      passHref={ROUTES.pass}
    />
  );
}
