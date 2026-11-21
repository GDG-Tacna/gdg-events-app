import { compareEntries } from "@/features/leaderboard/constants";
import { chooseImage, dropReplacedImage, type ImageRef, type RecordImages } from "@/features/media/constants";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";

/**
 * The final swag raffle of an edition. Each prize has its own rule for who takes part: every cadet with G-Credits
 * (each G-Credit earned in the edition is a ticket; nothing is spent, the global wallet is untouched, and there is a
 * global minimum to enter), the top N of the fleet ranking by XP, or every cadet with a minimum XP (in those two,
 * every entrant holds one ticket: the same chance). Each unit of each prize is drawn on the server, weighted by
 * tickets. A winner never wins again; a draw can be voided (the winner was not in the room), which frees the unit
 * and keeps that cadet out.
 */

export const MIN_CREDITS_MAX = 10_000;
export const PRIZE_QUANTITY_MAX = 50;
export const PRIZE_NAME_MIN = 2;
export const PRIZE_NAME_MAX = 60;
/** The largest top a prize can be drawn among. */
export const TOP_N_MAX = 100;
/** The highest XP minimum a prize can ask for. */
export const MIN_XP_MAX = 100_000;
/** Names the stage spins through before landing on the winner. */
export const REEL_SIZE = 24;

export interface RaffleSettings {
  /** G-Credits earned in the edition needed to enter (at least 1: a cadet without credits has no ticket). */
  minCredits: number;
}

export const DEFAULT_RAFFLE: RaffleSettings = { minCredits: 1 };

/**
 * Who takes part in a prize's draws: every cadet with the global minimum of G-Credits (`credits`, one ticket per
 * G-Credit), the first `n` cadets of the XP ranking who have not won yet (`top`), or every cadet with at least
 * `min` XP (`xp`). In `top` and `xp` each entrant holds one ticket, and a cadet without XP never enters.
 */
export type PrizeRule = { kind: "credits" } | { kind: "top"; n: number } | { kind: "xp"; min: number };
export type PrizeRuleKind = PrizeRule["kind"];

/** What a prize without a stored rule follows: the open G-Credits raffle (prizes and draws made before rules). */
export const DEFAULT_RULE: PrizeRule = { kind: "credits" };

export interface RafflePrize {
  id: string;
  name: string;
  /** How many units are given away. */
  quantity: number;
  /** Units drawn and not voided. */
  awarded: number;
  /** Draws made so far, voided ones included: the next draw is number `drawSeq + 1`. */
  drawSeq: number;
  active: boolean;
  order: number;
  /** A photo of the prize, shown in the admin and on the stage when it is drawn. */
  image: ImageRef | null;
  /** Who takes part in this prize's draws. */
  rule: PrizeRule;
}

export interface RaffleDraw {
  /** `{prizeId}-{number}`: one draw per number, so a repeated request never draws twice. */
  id: string;
  prizeId: string;
  prizeName: string;
  winnerUid: string;
  winnerAlias: string;
  winnerSquadId: string | null;
  /** The winner's tickets, all tickets in the draw, and how many cadets were in it. */
  tickets: number;
  totalTickets: number;
  entrants: number;
  /** The prize's rule when it was drawn (draws made before rules read as `credits`). */
  rule: PrizeRule;
  at: Date;
  voided: boolean;
  /** The prize's image when it was drawn, for the stage (answered by a draw, never stored with it). */
  prizeImageUrl?: string | null;
}

/**
 * A cadet as the raffle sees them: their G-Credits earned in this edition (their tickets in a `credits` draw), and
 * their XP in it with when they reached it (`null` when unknown), which place them in the ranking.
 */
export interface Entrant {
  uid: string;
  alias: string;
  squadId: string | null;
  credits: number;
  xp: number;
  reachedAt: Date | null;
}

export type NewDraw = Omit<RaffleDraw, "id" | "prizeId" | "prizeName" | "voided" | "prizeImageUrl">;

export interface RaffleStore {
  settings(): Promise<Result<RaffleSettings | null, { code: string }>>;
  saveSettings(settings: RaffleSettings): Promise<Result<void, { code: string }>>;
  prizes(): Promise<Result<readonly RafflePrize[], { code: string }>>;
  createPrize(prize: Omit<RafflePrize, "id">): Promise<Result<RafflePrize, { code: string }>>;
  /** `null` when the prize does not exist. */
  updatePrize(id: string, patch: Partial<Pick<RafflePrize, "name" | "quantity" | "active" | "image" | "rule">>): Promise<Result<{ before: RafflePrize; after: RafflePrize } | null, { code: string }>>;
  draws(): Promise<Result<readonly RaffleDraw[], { code: string }>>;
  /** The draws one cadet won (voided ones included): a cadet's visit reads only these. */
  drawsOf(uid: string): Promise<Result<readonly RaffleDraw[], { code: string }>>;
  /**
   * Draws the next unit of a prize in one transaction: reads the prize and every draw, asks `build` for the
   * winner, and writes the draw (`{prizeId}-{drawSeq + 1}`) with the prize's new counts. `build`'s refusal is
   * passed through and nothing is written.
   */
  draw(
    prizeId: string,
    build: (prize: RafflePrize, draws: readonly RaffleDraw[]) => Result<NewDraw, { code: RaffleErrorCode }>,
  ): Promise<Result<RaffleDraw, { code: RaffleErrorCode | "unknown" }>>;
  /** Voids a draw and frees its unit, in one transaction. */
  voidDraw(drawId: string): Promise<Result<RaffleDraw, { code: RaffleErrorCode | "unknown" }>>;
}

export interface RaffleDeps {
  store: RaffleStore;
  entrants: { list(): Promise<Result<readonly Entrant[], { code: string }>> };
  /** A uniform whole number in `[0, max)`, from a cryptographic source. */
  random: (max: number) => number;
  images: RecordImages;
  /** Puts a draw on the stage screen (the leaderboard feature answers it). Never fails the draw. */
  stage: { present(draw: RaffleDraw, reel: readonly string[]): Promise<Result<void, { code: string }>> };
  audit: {
    append(entry: { action: RaffleAuditAction; actorUid: string; targetUid: string; details: Record<string, string | null>; at: Date }): Promise<Result<void, { code: string }>>;
  };
  now: () => Date;
}

export type RaffleAuditAction = "raffle.settings.updated" | "raffle.prize.created" | "raffle.prize.updated" | "raffle.drawn" | "raffle.voided";

export type RaffleErrorCode =
  | "invalid-settings"
  | "invalid-name"
  | "invalid-quantity"
  | "invalid-image"
  /** A prize's rule is not one of the kinds, or its top or XP minimum is out of range. */
  | "invalid-rule"
  /** A prize's quantity cannot go below the units already given. */
  | "quantity-below-awarded"
  | "not-found"
  | "inactive"
  /** Every unit of the prize has been given. */
  | "exhausted"
  /** Nobody has enough tickets (or everyone who had has already won). */
  | "no-entrants"
  | "already-voided"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface RaffleActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

const fail = (code: RaffleErrorCode) => err({ code });
const whole = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

export function parseRaffleSettings(input: unknown): RaffleSettings | null {
  if (typeof input !== "object" || input === null) return null;
  const { minCredits } = input as Record<string, unknown>;
  return whole(minCredits, 1, MIN_CREDITS_MAX) ? { minCredits } : null;
}

const prizeName = (value: unknown) => {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= PRIZE_NAME_MIN && name.length <= PRIZE_NAME_MAX ? name : null;
};

/** A prize's rule as stored or sent, or `null` when it is not one of the kinds or its number is out of range. */
export function parsePrizeRule(input: unknown): PrizeRule | null {
  if (typeof input !== "object" || input === null) return null;
  const { kind, n, min } = input as Record<string, unknown>;
  if (kind === "credits") return { kind };
  if (kind === "top") return whole(n, 1, TOP_N_MAX) ? { kind, n } : null;
  if (kind === "xp") return whole(min, 1, MIN_XP_MAX) ? { kind, min } : null;
  return null;
}

/** A rule as one short text, for the audit trail and to tell whether it changed: `credits`, `top:10`, `xp:300`. */
export function ruleKey(rule: PrizeRule): string {
  return rule.kind === "top" ? `top:${rule.n}` : rule.kind === "xp" ? `xp:${rule.min}` : rule.kind;
}

/** An entrant's tickets under a rule: their G-Credits in a `credits` draw, one otherwise (everyone the same chance). */
export function ticketsOf(entrant: Entrant, rule: PrizeRule): number {
  return rule.kind === "credits" ? entrant.credits : 1;
}

/** Every ticket in a draw under a rule. */
export function totalTicketsOf(eligible: readonly Entrant[], rule: PrizeRule): number {
  return eligible.reduce((sum, entrant) => sum + ticketsOf(entrant, rule), 0);
}

/**
 * Who can win a prize now. Winners of a draw that stands or a voided one (absent) leave first, under every rule;
 * then `credits` keeps whoever has the global minimum of G-Credits, `xp` whoever has the XP minimum, and `top` the
 * first `n` with XP in the ranking's order (XP, then who reached it first, then alias). Because past winners left
 * before the top is taken, the top moves down the ranking: there are always `n` in play while the ranking has them.
 */
export function eligibleEntrants(entrants: readonly Entrant[], rule: PrizeRule, settings: RaffleSettings, draws: readonly RaffleDraw[]): Entrant[] {
  const out = new Set(draws.map((draw) => draw.winnerUid));
  const open = entrants.filter((entrant) => !out.has(entrant.uid));
  switch (rule.kind) {
    case "credits":
      return open.filter((entrant) => entrant.credits >= Math.max(1, settings.minCredits));
    case "xp":
      return open.filter((entrant) => entrant.xp > 0 && entrant.xp >= rule.min);
    case "top":
      return open
        .filter((entrant) => entrant.xp > 0)
        .sort(compareEntries)
        .slice(0, rule.n);
  }
}

/** One winner, each entrant's chance proportional to their tickets under the rule. `null` when nobody can win. */
export function pickWinner(eligible: readonly Entrant[], rule: PrizeRule, random: (max: number) => number): Entrant | null {
  const total = totalTicketsOf(eligible, rule);
  if (total <= 0) return null;
  let ticket = random(total);
  for (const entrant of eligible) {
    const tickets = ticketsOf(entrant, rule);
    if (ticket < tickets) return entrant;
    ticket -= tickets;
  }
  return null;
}

/** Up to `REEL_SIZE - 1` other entrants' aliases in random order, then the winner's: what the stage spins through. */
export function buildReel(eligible: readonly Entrant[], winner: Entrant, random: (max: number) => number): string[] {
  const others = eligible.filter((entrant) => entrant.uid !== winner.uid).map((entrant) => entrant.alias);
  for (let i = others.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [others[i], others[j]] = [others[j], others[i]];
  }
  return [...others.slice(0, REEL_SIZE - 1), winner.alias];
}

const forbidden = (actor: RaffleActor) => actor.role !== "admin";

async function audit(deps: Pick<RaffleDeps, "audit" | "now">, actor: RaffleActor, action: RaffleAuditAction, targetUid: string, details: Record<string, string | null>) {
  const written = await deps.audit.append({ action, actorUid: actor.uid, targetUid, details, at: deps.now() });
  if (!written.ok) logServerError("raffle.audit.append", new Error(`audit entry missing for ${action}`));
}

async function currentSettings(deps: { store: Pick<RaffleStore, "settings"> }): Promise<Result<{ settings: RaffleSettings; isDefault: boolean }, { code: "unknown" }>> {
  const read = await deps.store.settings();
  if (!read.ok) return err({ code: "unknown" });
  return ok({ settings: read.value ?? DEFAULT_RAFFLE, isDefault: read.value === null });
}

/** A prize on the admin's screen, with who could win its next draw under its rule, and their tickets. */
export interface RafflePrizeOverview extends RafflePrize {
  eligible: number;
  tickets: number;
}

export interface RaffleOverview {
  settings: RaffleSettings;
  isDefault: boolean;
  prizes: readonly RafflePrizeOverview[];
  /** Newest first. */
  draws: readonly RaffleDraw[];
  /** Who could win the next G-Credits draw, and their tickets. */
  eligible: number;
  tickets: number;
}

/** Everything the admin's raffle screen shows. */
export async function getRaffleOverview(deps: Pick<RaffleDeps, "store" | "entrants">, actor: RaffleActor): Promise<Result<RaffleOverview, { code: RaffleErrorCode }>> {
  if (forbidden(actor)) return fail("forbidden");
  const [settings, prizes, draws, entrants] = await Promise.all([currentSettings(deps), deps.store.prizes(), deps.store.draws(), deps.entrants.list()]);
  if (!settings.ok || !prizes.ok || !draws.ok || !entrants.ok) return fail("unknown");
  const inPlay = (rule: PrizeRule) => {
    const eligible = eligibleEntrants(entrants.value, rule, settings.value.settings, draws.value);
    return { eligible: eligible.length, tickets: totalTicketsOf(eligible, rule) };
  };
  return ok({
    ...settings.value,
    prizes: [...prizes.value].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)).map((prize) => ({ ...prize, ...inPlay(prize.rule) })),
    draws: [...draws.value].sort((a, b) => b.at.getTime() - a.at.getTime()),
    ...inPlay(DEFAULT_RULE),
  });
}

export async function saveRaffleSettings(deps: RaffleDeps, actor: RaffleActor, input: unknown): Promise<Result<RaffleSettings, { code: RaffleErrorCode }>> {
  if (forbidden(actor)) return fail("forbidden");
  const settings = parseRaffleSettings(input);
  if (!settings) return fail("invalid-settings");
  const saved = await deps.store.saveSettings(settings);
  if (!saved.ok) return fail("unknown");
  await audit(deps, actor, "raffle.settings.updated", "raffle", { minCredits: String(settings.minCredits) });
  return ok(settings);
}

/** Adds a prize at the end of the list. A prize sent without a rule follows the G-Credits raffle. */
export async function createRafflePrize(
  deps: RaffleDeps,
  actor: RaffleActor,
  input: { name: unknown; quantity: unknown; imagePath?: unknown; rule?: unknown },
): Promise<Result<RafflePrize, { code: RaffleErrorCode }>> {
  if (forbidden(actor)) return fail("forbidden");
  const name = prizeName(input.name);
  if (!name) return fail("invalid-name");
  if (!whole(input.quantity, 1, PRIZE_QUANTITY_MAX)) return fail("invalid-quantity");
  const rule = input.rule === undefined ? DEFAULT_RULE : parsePrizeRule(input.rule);
  if (!rule) return fail("invalid-rule");
  const image = chooseImage(deps.images, "raffle-prize", input.imagePath);
  if (!image) return fail("invalid-image");
  const listed = await deps.store.prizes();
  if (!listed.ok) return fail("unknown");
  const order = Math.max(-1, ...listed.value.map((prize) => prize.order)) + 1;
  const created = await deps.store.createPrize({ name, quantity: input.quantity, awarded: 0, drawSeq: 0, active: true, order, image: image.keep ? null : image.image, rule });
  if (!created.ok) return fail("unknown");
  await audit(deps, actor, "raffle.prize.created", created.value.id, { name, quantity: String(input.quantity), rule: ruleKey(rule) });
  return ok(created.value);
}

export async function updateRafflePrize(
  deps: RaffleDeps,
  actor: RaffleActor,
  input: { id: string; name?: unknown; quantity?: unknown; active?: unknown; imagePath?: unknown; rule?: unknown },
): Promise<Result<RafflePrize, { code: RaffleErrorCode }>> {
  if (forbidden(actor)) return fail("forbidden");
  const patch: Partial<Pick<RafflePrize, "name" | "quantity" | "active" | "image" | "rule">> = {};
  const image = chooseImage(deps.images, "raffle-prize", input.imagePath);
  if (!image) return fail("invalid-image");
  if (!image.keep) patch.image = image.image;
  if (input.name !== undefined) {
    const name = prizeName(input.name);
    if (!name) return fail("invalid-name");
    patch.name = name;
  }
  if (input.quantity !== undefined) {
    if (!whole(input.quantity, 1, PRIZE_QUANTITY_MAX)) return fail("invalid-quantity");
    patch.quantity = input.quantity;
  }
  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") return fail("invalid-settings");
    patch.active = input.active;
  }
  if (input.rule !== undefined) {
    const rule = parsePrizeRule(input.rule);
    if (!rule) return fail("invalid-rule");
    patch.rule = rule;
  }
  if (patch.quantity !== undefined) {
    const listed = await deps.store.prizes();
    if (!listed.ok) return fail("unknown");
    const current = listed.value.find((prize) => prize.id === input.id);
    if (!current) return fail("not-found");
    if (patch.quantity < current.awarded) return fail("quantity-below-awarded");
  }
  const updated = await deps.store.updatePrize(input.id, patch);
  if (!updated.ok) return fail(updated.error.code === "quantity-below-awarded" ? "quantity-below-awarded" : "unknown");
  if (!updated.value) return fail("not-found");
  const { before, after } = updated.value;
  await dropReplacedImage(deps.images, before.image, after.image);
  const changed = [
    ...(["name", "quantity", "active"] as const).filter((field) => before[field] !== after[field]),
    ...(before.image?.path === after.image?.path ? [] : ["image"]),
    ...(ruleKey(before.rule) === ruleKey(after.rule) ? [] : ["rule"]),
  ];
  if (changed.length > 0) await audit(deps, actor, "raffle.prize.updated", input.id, { changed: changed.join(","), name: after.name });
  return ok(after);
}

/**
 * Draws the next unit of a prize: a winner among the cadets its rule lets in who have not won (or been voided),
 * weighted by tickets (one each outside the G-Credits rule), with a cryptographic random number. The rule is read
 * from the prize inside the draw's transaction and kept with the draw. Recorded and audited, then shown on the stage (a stage
 * that cannot be updated never undoes the draw).
 */
export async function drawRafflePrize(deps: RaffleDeps, actor: RaffleActor, input: { prizeId: string }): Promise<Result<RaffleDraw, { code: RaffleErrorCode }>> {
  if (forbidden(actor)) return fail("forbidden");
  const [settings, entrants] = await Promise.all([currentSettings(deps), deps.entrants.list()]);
  if (!settings.ok || !entrants.ok) return fail("unknown");

  let reel: string[] = [];
  const drawn = await deps.store.draw(input.prizeId, (prize, draws) => {
    if (!prize.active) return fail("inactive");
    if (prize.awarded >= prize.quantity) return fail("exhausted");
    const eligible = eligibleEntrants(entrants.value, prize.rule, settings.value.settings, draws);
    const winner = pickWinner(eligible, prize.rule, deps.random);
    if (!winner) return fail("no-entrants");
    reel = buildReel(eligible, winner, deps.random);
    return ok({
      winnerUid: winner.uid,
      winnerAlias: winner.alias,
      winnerSquadId: winner.squadId,
      tickets: ticketsOf(winner, prize.rule),
      totalTickets: totalTicketsOf(eligible, prize.rule),
      entrants: eligible.length,
      rule: prize.rule,
      at: deps.now(),
    });
  });
  if (!drawn.ok) return drawn;

  await audit(deps, actor, "raffle.drawn", drawn.value.id, {
    prize: drawn.value.prizeName,
    winner: drawn.value.winnerUid,
    tickets: `${drawn.value.tickets}/${drawn.value.totalTickets}`,
    rule: ruleKey(drawn.value.rule),
  });
  const shown = await deps.stage.present(drawn.value, reel);
  if (!shown.ok) logServerError("raffle.stage.present", new Error(`draw ${drawn.value.id} not shown on the stage`));
  return drawn;
}

/** Voids a draw (the winner was not there): the unit can be drawn again and that cadet stays out. Audited. */
export async function voidRaffleDraw(deps: RaffleDeps, actor: RaffleActor, input: { drawId: string }): Promise<Result<RaffleDraw, { code: RaffleErrorCode }>> {
  if (forbidden(actor)) return fail("forbidden");
  const voided = await deps.store.voidDraw(input.drawId);
  if (!voided.ok) return voided;
  await audit(deps, actor, "raffle.voided", input.drawId, { prize: voided.value.prizeName, winner: voided.value.winnerUid });
  return voided;
}

export interface CadetTickets {
  tickets: number;
  minCredits: number;
  /** Has the minimum and has not been drawn yet. */
  eligible: boolean;
  /** Prizes this cadet won (draws that stand). */
  won: readonly string[];
}

/**
 * A cadet's tickets for the raffle and what they won, for the app. Their tickets are the G-Credits they earned in
 * this edition, which the caller already has: nobody else's profile is read on a cadet's visit.
 */
export async function getCadetTickets(deps: { store: Pick<RaffleStore, "settings" | "drawsOf"> }, uid: string, credits: number): Promise<Result<CadetTickets, { code: RaffleErrorCode }>> {
  const [settings, draws] = await Promise.all([currentSettings(deps), deps.store.drawsOf(uid)]);
  if (!settings.ok || !draws.ok) return fail("unknown");
  const mine = draws.value.filter((draw) => draw.winnerUid === uid);
  return ok({
    tickets: credits,
    minCredits: settings.value.settings.minCredits,
    eligible: credits >= settings.value.settings.minCredits && mine.length === 0,
    won: mine.filter((draw) => !draw.voided).map((draw) => draw.prizeName),
  });
}
