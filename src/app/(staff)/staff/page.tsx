import type { Metadata } from "next";
import { serveDeps } from "@/app-shell/composition/checkpoints.server";
import { requireRole } from "@/app-shell/guards";
import { staffStations } from "@/app-shell/permissions.server";
import { STATION_KINDS } from "@/features/checkpoints";
import { listServePoints } from "@/features/checkpoints/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { ButtonLink, Card, ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.staff.title };

export default async function StaffHomePage() {
  const session = await requireRole(["staff"]);

  const points = await listServePoints(serveDeps, { uid: session.uid, role: session.role, kinds: session.role === "staff" ? await staffStations() : undefined });
  // A failed read goes to the route error boundary instead of claiming there is nothing to operate.
  if (!points.ok) throw new Error("Could not read the stations");

  // The use case already orders them entrance, catering, stand; each kind with stations gets its own group.
  const groups = STATION_KINDS.map((kind) => ({ kind, points: points.value.filter((point) => point.kind === kind) })).filter((group) => group.points.length > 0);

  return (
    <ScreenEnter>
      <div className="gap-space-6 flex flex-col">
        <header className="gap-space-1 flex flex-col">
          <h1 className="type-title-xl text-foreground">{copy.staff.title}</h1>
          <p className="type-body text-muted-foreground">{copy.staff.subtitle}</p>
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
                        <div className="gap-space-1 flex flex-col">
                          <h3 className="type-title text-foreground">{point.name}</h3>
                          {point.servedCount !== null ? (
                            <p className="type-body-sm text-muted-foreground tabular-nums">
                              {interpolate(copy.staff.servedCount[point.kind], { count: String(point.servedCount) })}
                            </p>
                          ) : null}
                        </div>
                        <ButtonLink href={`${ROUTES.staff}/serve/${point.id}`} className="mt-auto">
                          {copy.staff.serve}
                        </ButtonLink>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </ScreenEnter>
  );
}
