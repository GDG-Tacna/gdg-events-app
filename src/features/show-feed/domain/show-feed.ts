import { err, ok, type Result } from "@/shared/lib/result";

/**
 * The show feed: read-only data for the event's local screens (the production show that runs from the operator's
 * laptop). The show pulls the fleet ranking and the attendance code of the talk in progress; it never sends anything
 * back, and the app never drives the projector. Access is one shared secret sent as a bearer token.
 */

/** A shorter secret switches the feed off: a guessable token would hand out talk codes. */
export const SHOW_FEED_TOKEN_MIN = 32;

/** The longest talk id the feed accepts (the same bound as the QR server action). */
export const TALK_ID_MAX = 48;

export type FeedAccess = "ok" | "disabled" | "unauthorized";

/** Same length and same characters, comparing every character so the time does not tell how much matched. */
function sameSecret(given: string, secret: string): boolean {
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let index = 0; index < secret.length; index++) diff |= given.charCodeAt(index) ^ secret.charCodeAt(index);
  return diff === 0;
}

/**
 * Whether a request may read the feed: switched off without a secret long enough, refused without the right
 * `Authorization: Bearer <secret>` header.
 */
export function checkFeedAccess(authorization: string | null, secret: string | undefined): FeedAccess {
  if (!secret || secret.length < SHOW_FEED_TOKEN_MIN) return "disabled";
  const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? "");
  return match && sameSecret(match[1].trim(), secret) ? "ok" : "unauthorized";
}

/** A talk as the feed reads it (the talks feature answers it). */
export interface FeedTalk {
  id: string;
  title: string;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
}

export interface FeedTalkView {
  id: string;
  name: string;
  /** Milliseconds since the epoch, or `null` when the talk has no schedule. */
  startsAt: number | null;
  endsAt: number | null;
  active: boolean;
  /** Whether `qr` hands out its code: any open talk, at any time (the operator decides when to show it). */
  qrNow: boolean;
}

/** The talks for the show, in schedule order (unscheduled last, then by name). */
export function feedTalks(talks: readonly FeedTalk[]): FeedTalkView[] {
  const startOf = (talk: FeedTalk) => talk.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return [...talks]
    .sort((a, b) => startOf(a) - startOf(b) || a.title.localeCompare(b.title, "es"))
    .map((talk) => ({
      id: talk.id,
      name: talk.title,
      startsAt: talk.startsAt?.getTime() ?? null,
      endsAt: talk.endsAt?.getTime() ?? null,
      active: talk.active,
      qrNow: talk.active,
    }));
}

/** A signed code as the ephemeral QR feature issues it; the feed passes on only its picture and timing. */
export interface FeedIssuedQr {
  checkpointId: string;
  name: string;
  cells: readonly string[];
  issuedAt: number;
  expiresAt: number;
}

export interface TalkQrDeps {
  talks(): Promise<Result<readonly FeedTalk[], { code: string }>>;
  /** Issues the code of a talk that already passed the feed's checks. */
  issue(talkId: string): Promise<Result<FeedIssuedQr, { code: string }>>;
}

export type TalkQrErrorCode = "bad-request" | "not-found" | "inactive" | "unknown";

export interface FeedTalkQr {
  talkId: string;
  name: string;
  cells: readonly string[];
  issuedAt: number;
  expiresAt: number;
}

/**
 * The attendance code of a talk of the edition, at any time: the show's operator decides when to project it (speakers
 * ask for it before or after their slot, and talks run late). Only an open talk gets one, and each call issues a fresh
 * two-minute code, so a projected code stops working on its own.
 */
export async function getTalkQr(deps: TalkQrDeps, talkId: string | null): Promise<Result<FeedTalkQr, { code: TalkQrErrorCode }>> {
  const id = talkId?.trim() ?? "";
  if (!id || id.length > TALK_ID_MAX) return err({ code: "bad-request" });

  const talks = await deps.talks();
  if (!talks.ok) return err({ code: "unknown" });
  const talk = talks.value.find((candidate) => candidate.id === id);
  if (!talk) return err({ code: "not-found" });
  if (!talk.active) return err({ code: "inactive" });

  const issued = await deps.issue(talk.id);
  if (!issued.ok) {
    if (issued.error.code === "checkpoint-not-found" || issued.error.code === "not-shown-on-screen") return err({ code: "not-found" });
    if (issued.error.code === "checkpoint-inactive") return err({ code: "inactive" });
    return err({ code: "unknown" });
  }
  const { checkpointId, name, cells, issuedAt, expiresAt } = issued.value;
  return ok({ talkId: checkpointId, name, cells, issuedAt, expiresAt });
}

/** A poll as the feed reads it (the polls feature answers it). */
export interface FeedPollSource {
  id: string;
  question: string;
  status: "draft" | "open" | "closed";
  options: ReadonlyArray<{ id: string; text: string; image: { url: string } | null }>;
  createdAt: Date;
}

export interface FeedPollItem {
  id: string;
  question: string;
  status: "open" | "closed";
}

/** The polls the show may project: the open one first, then closed ones, newest first. Drafts have no votes yet. */
export function feedPolls(polls: readonly FeedPollSource[]): FeedPollItem[] {
  return polls
    .filter((poll): poll is FeedPollSource & { status: "open" | "closed" } => poll.status !== "draft")
    .sort((a, b) => (a.status === b.status ? b.createdAt.getTime() - a.createdAt.getTime() : a.status === "open" ? -1 : 1))
    .map(({ id, question, status }) => ({ id, question, status }));
}

export interface FeedPollView extends FeedPollItem {
  options: Array<{ id: string; text: string; imageUrl: string | null; votes: number }>;
  total: number;
}

/** One poll's results for the show: each option with its votes (the show draws the shares). */
export function feedPoll(poll: FeedPollSource & { status: "open" | "closed" }, tally: { counts: Readonly<Record<string, number>>; total: number }): FeedPollView {
  return {
    id: poll.id,
    question: poll.question,
    status: poll.status,
    options: poll.options.map((option) => ({ id: option.id, text: option.text, imageUrl: option.image?.url ?? null, votes: tally.counts[option.id] ?? 0 })),
    total: tally.total,
  };
}

/** A raffle draw as the feed reads it (the raffle feature answers it), with the squad names to name the winner's. */
export interface FeedDrawSource {
  id: string;
  prizeId: string;
  prizeName: string;
  winnerAlias: string;
  winnerSquadId: string | null;
  tickets: number;
  totalTickets: number;
  at: Date;
  voided: boolean;
}

export interface FeedDrawView {
  id: string;
  prizeName: string;
  prizeImageUrl: string | null;
  winner: { alias: string; squad: string | null };
  tickets: number;
  totalTickets: number;
  at: number;
  /** The names the app's own stage spun through for this draw (the latest one only); empty otherwise. */
  reel: string[];
}

/**
 * The raffle's winners for the show, newest first: voided draws left out (the winner was not in the room). The draw
 * itself is made in the app's admin; the show only projects it. No uid ever leaves.
 */
export function feedDraws(
  draws: readonly FeedDrawSource[],
  prizes: ReadonlyArray<{ id: string; image: { url: string } | null }>,
  squads: ReadonlyArray<{ id: string; name: string }>,
  staged: { drawId: string; reel: readonly string[] } | null,
): FeedDrawView[] {
  const prizeImage = new Map(prizes.map((prize) => [prize.id, prize.image?.url ?? null]));
  const squadName = new Map(squads.map((squad) => [squad.id, squad.name]));
  return draws
    .filter((draw) => !draw.voided)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((draw) => ({
      id: draw.id,
      prizeName: draw.prizeName,
      prizeImageUrl: prizeImage.get(draw.prizeId) ?? null,
      winner: { alias: draw.winnerAlias, squad: draw.winnerSquadId ? (squadName.get(draw.winnerSquadId) ?? null) : null },
      tickets: draw.tickets,
      totalTickets: draw.totalTickets,
      at: draw.at.getTime(),
      reel: staged && staged.drawId === draw.id ? [...staged.reel] : [],
    }));
}
