import type { ReactNode } from "react";
import { ButtonLink, Card, Icon, type AvatarLook } from "@/shared/ui";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import type { PixelSpriteData } from "@/shared/types/pixel";
import type { DashboardOverview, SquadCalloutKind } from "../domain/overview";
import { PlayerCard } from "./PlayerCard";
import { SquadCallout } from "./SquadCallout";

export interface DashboardViewProps {
  overview: DashboardOverview;
  /** What to show about the squad (decided by `decideSquadCallout`). */
  squadCallout: SquadCalloutKind;
  /** Badge shown inside the attendee card when the attendee has a squad. */
  squadBadge?: ReactNode;
  /** Logos for the "discover your squad" invitation. */
  squadPreviews: ReadonlyArray<{ id: string; sprite: PixelSpriteData }>;
  squadHref: string;
  /** The squad's credits and prizes, built by the app shell (only for a member when squad credits are on). */
  squadCreditsSlot?: ReactNode;
  /** The cadet's personal QR, opened from a button on the attendee card and from the account menu (absent when check-ins are off). */
  qrHref?: string;
  /** The Red, opened from a button on the attendee card and from the account menu (absent when the network is off). */
  networkHref?: string;
  /** The look the cadet chose for their avatar (the alias gives it when absent). */
  avatarLook?: AvatarLook | null;
  /** The avatar editor, linked from the avatar on the cadet card. */
  avatarHref?: string;
  /** The open missions, the terminal's first entry, built by the app shell. */
  missionsSlot?: ReactNode;
  /** The cadet's place in the fleet ranking and the top 10, built by the app shell; under the attendee card. */
  standingSlot?: ReactNode;
  /** Extra card at the end (for example how to install the app), built by the app shell. */
  installSlot?: ReactNode;
  /** The live poll while one is open, built by the app shell; first, since it lasts only minutes. */
  pollSlot?: ReactNode;
  /** For a cadet who is also a speaker: the way to their speaker code, built by the app shell; at the top. */
  speakerSlot?: ReactNode;
  /** For a team account that plays as a cadet: the way back to its team screen, built by the app shell; at the top. */
  teamSlot?: ReactNode;
  /** Event certificates entry card in the mission terminal when certificates are available or issued. */
  certificatesSlot?: ReactNode;
  /** True once the public edition has ended, switching the dashboard into post-event archive mode. */
  eventFinished?: boolean;
  /** Edition name for the post-event banner when available. */
  eventName?: string | null;
  /** Direct link to Logros shown as a summary card in post-event mode. */
  achievementsHref?: string;
}

/**
 * The cadet's dashboard, an arcade terminal (the brand and sign out are in the attendee shell's header, the QR and the Red are on the card): the compact
 * cadet card (and their place in the ranking), then the "Terminal de misión" with every entry. One column
 * up to 520px; from 760px the cadet's column on the left and the terminal on the right. Data arrives ready.
 */
export function DashboardView({
  overview,
  squadCallout,
  squadBadge,
  squadPreviews,
  squadHref,
  squadCreditsSlot,
  qrHref,
  networkHref,
  avatarLook,
  avatarHref,
  missionsSlot,
  standingSlot,
  installSlot,
  pollSlot,
  speakerSlot,
  teamSlot,
  certificatesSlot,
  eventFinished = false,
  eventName,
  achievementsHref,
}: DashboardViewProps) {
  const t = copy.dashboard;
  const finishedTitle = eventName ? interpolate(t.finished.titleNamed, { name: eventName }) : t.finished.titleFallback;
  return (
    <div className="gap-space-5 flex flex-col">
      <h1 className="sr-only">{t.title}</h1>

      {eventFinished ? (
        <Card className="border-ink bg-pastel-blue/30 gap-space-2 flex flex-col border-2">
          <div className="gap-space-2 flex items-center">
            <span className="bg-primary text-primary-foreground border-ink grid size-8 shrink-0 place-items-center rounded-full border-2">
              <Icon name="verified" size={18} />
            </span>
            <p className="type-caption text-cyan-ink font-semibold uppercase tracking-wider">{t.finished.badge}</p>
          </div>
          <h2 className="type-title text-foreground">{finishedTitle}</h2>
          <p className="type-body-sm text-muted-foreground">{t.finished.body}</p>
        </Card>
      ) : null}

      <div className="gap-space-5 grid min-[760px]:grid-cols-2 min-[760px]:items-start">
        <div className="gap-space-4 flex flex-col">
          {teamSlot}
          {speakerSlot}
          {pollSlot}
          <PlayerCard overview={overview} squadSlot={squadCallout === "badge" ? squadBadge : undefined} qrHref={qrHref} networkHref={networkHref} avatarLook={avatarLook} avatarHref={avatarHref} />
          {standingSlot}
        </div>

        <section aria-labelledby="terminal-title" className="gap-space-4 flex flex-col">
          <div className="gap-space-3 flex items-center justify-between">
            <h2 id="terminal-title" className="type-pixel-heading text-cyan-ink gap-space-2 flex items-center">
              <span aria-hidden="true" className="bg-cyan inline-block size-2 rounded-[2px]" />
              {eventFinished ? t.finished.terminalTitle : t.terminal.title}
            </h2>
            <span aria-hidden="true" className="type-caption text-text-subtle tracking-wider uppercase">
              {eventFinished ? t.finished.terminalFlavor : t.terminal.flavor}
            </span>
          </div>
          {!eventFinished && squadCallout === "discover" ? <SquadCallout previews={squadPreviews} href={squadHref} /> : null}
          {certificatesSlot}
          {eventFinished && achievementsHref ? (
            <Card className="gap-space-3 flex flex-col">
              <div className="gap-space-2 flex items-center">
                <Icon name="trophy" size={22} className="text-gold-ink" />
                <h3 className="type-title text-foreground">{t.finished.achievementsCard.title}</h3>
              </div>
              <p className="type-body-sm text-muted-foreground">{t.finished.achievementsCard.none}</p>
              <ButtonLink href={achievementsHref} variant="secondary" block>
                {t.finished.achievementsCard.open}
              </ButtonLink>
            </Card>
          ) : null}
          {missionsSlot}
          {squadCallout === "badge" ? squadCreditsSlot : null}
          {installSlot}
        </section>
      </div>
    </div>
  );
}
