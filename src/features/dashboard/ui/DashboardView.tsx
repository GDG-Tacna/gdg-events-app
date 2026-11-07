import type { ReactNode } from "react";
import type { AvatarLook } from "@/shared/ui";
import { SignOutButton } from "@/features/auth";
import { copy } from "@/shared/copy/es";
import type { PixelSpriteData } from "@/shared/types/pixel";
import { BrandMark } from "@/shared/ui";
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
}

/**
 * The cadet's dashboard, an arcade terminal: the brand with sign out on the header (the QR and the Red are on the card), the compact
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
}: DashboardViewProps) {
  const t = copy.dashboard;
  return (
    <div className="gap-space-5 flex flex-col">
      <header className="gap-space-3 flex items-start justify-between">
        <BrandMark />
        <div className="gap-space-2 flex shrink-0 items-center">
          <SignOutButton variant="icon" />
        </div>
      </header>
      <h1 className="sr-only">{t.title}</h1>

      <div className="gap-space-5 grid min-[760px]:grid-cols-2 min-[760px]:items-start">
        <div className="gap-space-4 flex flex-col">
          {speakerSlot}
          {pollSlot}
          <PlayerCard overview={overview} squadSlot={squadCallout === "badge" ? squadBadge : undefined} qrHref={qrHref} networkHref={networkHref} avatarLook={avatarLook} avatarHref={avatarHref} />
          {standingSlot}
        </div>

        <section aria-labelledby="terminal-title" className="gap-space-4 flex flex-col">
          <div className="gap-space-3 flex items-center justify-between">
            <h2 id="terminal-title" className="type-pixel-heading text-cyan gap-space-2 flex items-center">
              <span aria-hidden="true" className="bg-cyan inline-block size-2 rounded-[2px]" />
              {t.terminal.title}
            </h2>
            <span aria-hidden="true" className="type-caption text-text-subtle tracking-wider uppercase">
              {t.terminal.flavor}
            </span>
          </div>
          {squadCallout === "discover" ? <SquadCallout previews={squadPreviews} href={squadHref} /> : null}
          {missionsSlot}
          {squadCallout === "badge" ? squadCreditsSlot : null}
          {installSlot}
        </section>
      </div>
    </div>
  );
}
