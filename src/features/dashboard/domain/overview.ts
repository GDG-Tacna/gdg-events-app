import { RANKS, rankProgress, type Attendee, type RankId, type RankLadder } from "@/features/attendee";
import type { SquadId } from "@/shared/types/squad";

/** Everything the dashboard needs to draw the attendee card. Plain data: it crosses to client components. */
export interface DashboardOverview {
  alias: string;
  xp: number;
  /** G-Credits earned in this edition. */
  credits: number;
  /** The person's G-Credits across every edition, or `null` when it could not be read. */
  walletBalance: number | null;
  /** False when the edition switched G-Credits off: the card does not show them. */
  creditsEnabled: boolean;
  /** `name` is the one the admin gave the rank, or null (the copy names it then). */
  rank: { id: RankId; level: number; name: string | null; iconUrl: string | null };
  /** The rank to reach next, or null at the top. */
  nextRank: { id: RankId; level: number; minXp: number } | null;
  /** 0 to 100: how far the attendee is from the next rank. 100 at the top. */
  progressPercent: number;
  squadId: SquadId | null;
}

/** Attendee entity to the card's view model. The rank is derived from XP, never stored. */
/** What the economy says about one person: whether credits are on, and their wallet. */
export interface WalletView {
  creditsEnabled: boolean;
  balance: number | null;
}

export function buildOverview(attendee: Attendee, ladder: RankLadder = RANKS, wallet: WalletView = { creditsEnabled: true, balance: null }): DashboardOverview {
  const progress = rankProgress(attendee.xp, ladder);

  return {
    alias: attendee.alias,
    xp: attendee.xp,
    credits: attendee.credits,
    walletBalance: wallet.balance,
    creditsEnabled: wallet.creditsEnabled,
    rank: { id: progress.rank.id, level: progress.rank.level, name: progress.rank.name ?? null, iconUrl: progress.rank.icon?.url ?? null },
    nextRank: progress.next
      ? { id: progress.next.id, level: progress.next.level, minXp: progress.next.minXp }
      : null,
    progressPercent: progress.percent,
    squadId: attendee.squad,
  };
}

/**
 * What to show about the squad. The reveal is optional (feature flag), so the dashboard only
 * invites the attendee to it when the feature is on, they have no squad yet, and something can be assigned.
 */
export type SquadCalloutKind = "badge" | "discover" | "none";

export function decideSquadCallout(input: {
  featureEnabled: boolean;
  squadId: SquadId | null;
  availableSquads: number;
}): SquadCalloutKind {
  // An attendee keeps showing their squad even if the feature is later switched off or the squad retired.
  if (input.squadId !== null) return "badge";
  if (!input.featureEnabled || input.availableSquads === 0) return "none";
  return "discover";
}
