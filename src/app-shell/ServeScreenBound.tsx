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
}: {
  checkpointId: string;
  kind: StationKind;
  name: string;
  description?: string;
  image?: string | null;
  initialCount: number | null;
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
      backHref={ROUTES.staff}
      changeTicketHref={ROUTES.staffTickets}
    />
  );
}
