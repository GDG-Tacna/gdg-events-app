"use client";

import { serveAttendeeAction } from "@/app-shell/checkpoints/serve-attendee.action";
import { ServeScreen, type StationKind } from "@/features/checkpoints";
import { QrCodeCamera } from "@/features/scanner";
import { ROUTES } from "@/shared/config/routes";

/**
 * The serve screen bound to the real camera and the real server action. It lives in the app shell because
 * it is the one place that knows both: the page (server) cannot create a camera, and the feature does not
 * know which server action records a scan at a station.
 */
export function ServeScreenBound({
  checkpointId,
  kind,
  name,
  description,
  image,
  initialCount,
  backHref = ROUTES.staff,
  backLabel,
  stations,
  stationBase = `${ROUTES.staff}/serve`,
}: {
  checkpointId: string;
  kind: StationKind;
  name: string;
  description?: string;
  image?: string | null;
  initialCount: number | null;
  /** Where the back button goes: the staff's puestos by default. */
  backHref?: string;
  backLabel?: string;
  /** The open puestos to switch between from the scanner (the row hides with fewer than two). */
  stations?: readonly { id: string; name: string }[];
  /** Where each station's scanner lives: the staff's by default. */
  stationBase?: string;
}) {
  return (
    <ServeScreen
      camera={QrCodeCamera}
      serve={serveAttendeeAction}
      checkpointId={checkpointId}
      kind={kind}
      name={name}
      description={description}
      image={image}
      initialCount={initialCount}
      backHref={backHref}
      backLabel={backLabel}
      stations={stations}
      stationBase={stationBase}
      changeTicketHref={ROUTES.staffTickets}
    />
  );
}
