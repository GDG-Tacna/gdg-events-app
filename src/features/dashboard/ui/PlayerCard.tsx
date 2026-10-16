import Link from "next/link";
import type { ReactNode } from "react";
import { copy } from "@/shared/copy/es";
import { rankName } from "@/shared/copy/rank-name";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Icon, PixelAvatar, PixelCoin, PixelStar, ProgressBar, Thumbnail, type AvatarLook } from "@/shared/ui";
import type { DashboardOverview } from "../domain/overview";

export interface PlayerCardProps {
  overview: DashboardOverview;
  /** The squad badge, built by the app shell so this feature does not depend on the squads feature. */
  squadSlot?: ReactNode;
  /** The cadet's personal QR (staff scan it at the entrance, the catering and the stands); absent hides the button. */
  qrHref?: string;
  /** The Red (cadet network), absent when the network is off. */
  networkHref?: string;
  /** The look the cadet chose in the avatar editor; without it the alias gives it. */
  avatarLook?: AvatarLook | null;
  /** The avatar editor: the avatar becomes a link to it. */
  avatarHref?: string;
}

function StatTile({ icon, value, label, hint }: { icon: ReactNode; value: number; label: string; hint?: string }) {
  return (
    <div className="bg-bg-deep/70 border-border gap-space-3 p-space-3 flex items-center rounded-md border">
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="type-title text-foreground tabular-nums leading-tight">{formatNumber(value)}</span>
        <span className="type-caption text-text-subtle tracking-wider uppercase">{label}</span>
        {hint ? <span className="type-caption text-gold">{hint}</span> : null}
      </span>
    </div>
  );
}

/**
 * The cadet card, compact: the HD avatar, the alias with the button to the cadet's QR, the rank chip, the progress to
 * the next rank, and XP and G-Credits side by side (the squad badge under them when there is one).
 */
export function PlayerCard({ overview, squadSlot, qrHref, networkHref, avatarLook, avatarHref }: PlayerCardProps) {
  const { nextRank } = overview;
  const values = nextRank ? { xp: formatNumber(overview.xp), next: formatNumber(nextRank.minXp) } : null;
  const name = rankName(overview.rank.id, overview.rank.level, overview.rank.name);

  return (
    <section
      aria-label={copy.dashboard.attendeeCardLabel}
      className="border-cyan/60 from-surface to-bg-violet/50 shadow-card gap-space-4 p-space-4 flex flex-col rounded-lg border bg-gradient-to-br"
    >
      <div className="gap-space-4 flex items-center">
        {avatarHref ? (
          <Link
            href={avatarHref}
            aria-label={copy.avatar.edit}
            title={copy.avatar.edit}
            className="border-cyan/70 bg-gradient-to-b from-[#16306e] to-bg-deep shadow-[0_0_0_3px_rgba(34,211,238,0.12)] focus-visible:ring-ring relative grid size-[88px] shrink-0 place-items-center rounded-md border-2 focus-visible:ring-[3px] focus-visible:outline-none"
          >
            <PixelAvatar seed={overview.alias} look={avatarLook} scale={2} />
            <span aria-hidden="true" className="bg-primary text-primary-foreground absolute -right-2 -bottom-2 grid size-7 place-items-center rounded-full">
              <Icon name="edit" size={14} />
            </span>
          </Link>
        ) : (
          <div className="border-cyan/70 bg-gradient-to-b from-[#16306e] to-bg-deep shadow-[0_0_0_3px_rgba(34,211,238,0.12)] grid size-[88px] shrink-0 place-items-center rounded-md border-2">
            <PixelAvatar seed={overview.alias} look={avatarLook} scale={2} />
          </div>
        )}
        <div className="gap-space-2 flex min-w-0 flex-1 flex-col">
          {/* The alias shares its row with the Red and QR buttons; the rank chip keeps the column's full width below. */}
          <div className="gap-space-2 flex w-full items-center">
            <h2 className="type-title text-foreground min-w-0 flex-1 truncate">{overview.alias}</h2>
            {networkHref ? (
              <Link
                href={networkHref}
                aria-label={copy.dashboard.account.network}
                title={copy.dashboard.account.network}
                className="border-line-strong text-cyan hover:bg-secondary focus-visible:ring-ring inline-grid size-12 shrink-0 place-items-center rounded-md border focus-visible:ring-[3px] focus-visible:outline-none"
              >
                <Icon name="users" size={24} />
              </Link>
            ) : null}
            {qrHref ? (
              <Link
                href={qrHref}
                aria-label={copy.pass.open}
                title={copy.pass.open}
                className="border-line-strong text-cyan hover:bg-secondary focus-visible:ring-ring inline-grid size-12 shrink-0 place-items-center rounded-md border focus-visible:ring-[3px] focus-visible:outline-none"
              >
                <Icon name="qr" size={24} />
              </Link>
            ) : null}
          </div>
          <span className="border-primary/60 bg-primary/10 gap-space-2 px-space-2 inline-flex w-fit max-w-full items-center rounded-sm border py-0.5">
            {overview.rank.iconUrl ? <Thumbnail url={overview.rank.iconUrl} size={20} className="rounded-sm border-0 bg-transparent" /> : null}
            <span className="type-pixel-tag text-primary text-[14px] leading-5">{`NV ${overview.rank.level}`}</span>
            <span className="type-caption text-foreground truncate font-semibold tracking-wider uppercase">{name}</span>
          </span>
        </div>
      </div>

      <div className="gap-space-2 flex flex-col">
        <div className="gap-space-2 flex items-baseline justify-between">
          <span className="type-caption text-text-subtle">{copy.dashboard.rankProgress}</span>
          <span className="type-caption text-cyan tabular-nums">{values ? interpolate(copy.dashboard.progressCaption, values) : copy.dashboard.maxRank}</span>
        </div>
        <ProgressBar
          value={overview.progressPercent}
          label={copy.dashboard.progressLabel}
          valueText={values ? interpolate(copy.dashboard.progressSpoken, values) : copy.dashboard.maxRank}
          className="h-2"
        />
      </div>

      <div className={cn("gap-space-3 grid", overview.creditsEnabled ? "grid-cols-2" : "grid-cols-1")}>
        <StatTile icon={<PixelStar />} value={overview.xp} label={copy.dashboard.xpLabel} />
        {overview.creditsEnabled ? (
          <StatTile
            icon={<PixelCoin />}
            value={overview.walletBalance ?? overview.credits}
            label={copy.dashboard.creditsLabel}
            hint={overview.walletBalance !== null && overview.credits > 0 ? interpolate(copy.dashboard.creditsThisEvent, { n: formatNumber(overview.credits) }) : undefined}
          />
        ) : null}
      </div>

      {squadSlot ? <div>{squadSlot}</div> : null}
    </section>
  );
}
