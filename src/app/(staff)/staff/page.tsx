import type { Metadata } from "next";
import { serveDeps } from "@/app-shell/composition/checkpoints.server";
import { requireRole } from "@/app-shell/guards";
import { staffCheckpoints, staffStations } from "@/app-shell/permissions.server";
import { STATION_KINDS } from "@/features/checkpoints";
import { listServePoints } from "@/features/checkpoints/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { ButtonLink, Card, ScreenEnter, Thumbnail } from "@/shared/ui";

export const metadata: Metadata = { title: copy.staff.title };

export default async function StaffHomePage() {
  const session = await requireRole(["staff"]);

  const kinds = session.role === "staff" ? await staffStations() : undefined;
  const checkpointIds = await staffCheckpoints(session);
  const points = await listServePoints(serveDeps, { uid: session.uid, role: session.role, kinds, checkpointIds });
  // A failed read goes to the route error boundary instead of claiming there is nothing to operate.
  if (!points.ok) throw new Error("Could not read the stations");

  // The use case already orders them entrance, catering, stand; each kind with stations gets its own group.
  // Changing a ticket needs a station to operate, like serving: staff the organizer limited to none do not get the card.
  const mayChangeTickets = kinds === undefined || (kinds.length > 0 && (checkpointIds === undefined || checkpointIds.length > 0));
  const hasEntrance = points.value.some((point) => point.kind === "entrance");
  const groups = STATION_KINDS.map((kind) => ({ kind, points: points.value.filter((point) => point.kind === kind) })).filter((group) => group.points.length > 0);

  return (
    <ScreenEnter>
      <div className="gap-space-6 flex flex-col">
        <header className="gap-space-1 flex flex-col">
          <h1 className="type-title-xl text-foreground">{copy.staff.title}</h1>
          <p className="type-body text-muted-foreground">{copy.staff.subtitle}</p>
          <ButtonLink href={ROUTES.teamCode} variant="secondary" className="mt-space-3 self-start">
            {copy.teamCode.open}
          </ButtonLink>
        </header>

        {groups.length === 0 ? (
          <Card>
            <p className="type-body text-muted-foreground">{copy.staff.empty}</p>
          </Card>
        ) : (
          <div aria-label={copy.staff.listLabel} role="group" className="gap-space-6 flex flex-col">
            {groups.map((group) => (
              <section key={group.kind} aria-labelledby={`stations-${group.kind}`} className="gap-space-3 flex flex-col">
                <h2 id={`stations-${group.kind}`} className="type-label text-text-subtle uppercase tracking-wide">
                  {copy.staff.kinds[group.kind]}
                </h2>
                <ul className="gap-space-4 grid grid-cols-1 min-[560px]:grid-cols-2">
                  {group.points.map((point) => (
                    <li key={point.id}>
                      <Card className="gap-space-4 flex h-full flex-col">
                        <div className="gap-space-3 flex items-start">
                          {point.image ? <Thumbnail url={point.image} size={56} /> : null}
                          <div className="gap-space-1 flex min-w-0 flex-col">
                            <h3 className="type-title text-foreground">{point.name}</h3>
                            {point.description ? <p className="type-body-sm text-muted-foreground">{point.description}</p> : null}
                            {point.servedCount !== null ? (
                              <p className="type-body-sm text-muted-foreground tabular-nums">
                                {interpolate(copy.staff.servedCount[point.kind], { count: String(point.servedCount) })}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <ButtonLink href={`${ROUTES.staff}/serve/${point.id}`} className="mt-auto">
                          {copy.staff.serve}
                        </ButtonLink>
                        {point.kind === "entrance" || point.kind === "stand" ? (
                          <ButtonLink href={`${ROUTES.staffQr}/${point.id}`} variant="secondary">
                            {point.kind === "stand" ? copy.staff.showStandQr : copy.staff.showEntranceQr}
                          </ButtonLink>
                        ) : null}
                        {/* The ticket change belongs to the check-in: where the cadets come in, someone buys their ticket on the day. */}
                        {point.kind === "entrance" && mayChangeTickets ? (
                          <ButtonLink href={ROUTES.staffTickets} variant="secondary">
                            {copy.staff.tickets.card.title}
                          </ButtonLink>
                        ) : null}
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {/* With an open entrance the button lives in its card; the card at the bottom is for when there is none. */}
        {mayChangeTickets && !hasEntrance ? (
          <Card className="gap-space-3 flex flex-col">
            <div className="gap-space-1 flex flex-col">
              <h2 className="type-title text-foreground">{copy.staff.tickets.card.title}</h2>
              <p className="type-body-sm text-muted-foreground">{copy.staff.tickets.card.body}</p>
            </div>
            <ButtonLink href={ROUTES.staffTickets} variant="secondary">
              {copy.staff.tickets.card.title}
            </ButtonLink>
          </Card>
        ) : null}
      </div>
    </ScreenEnter>
  );
}
