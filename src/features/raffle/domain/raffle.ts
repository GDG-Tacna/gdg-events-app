import { chooseImage, dropReplacedImage, type ImageRef, type RecordImages } from "@/features/media/constants";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";

/**
 * The final swag raffle of an edition: every G-Credit a cadet earned in it is a ticket (nothing is spent; the
 * global wallet is untouched), cadets need a minimum to enter, and each unit of each prize is drawn on the server,
 * weighted by tickets. A winner never wins again; a draw can be voided (the winner was not in the room), which
 * frees the unit and keeps that cadet out.
 */

export const MIN_CREDITS_MAX = 10_000;
export const PRIZE_QUANTITY_MAX = 50;
export const PRIZE_NAME_MIN = 2;
export const PRIZE_NAME_MAX = 60;
/** Names the stage spins through before landing on the winner. */
export const REEL_SIZE = 24;

export interface RaffleSettings {
  /** G-Credits earned in the edition needed to enter (at least 1: a cadet without credits has no ticket). */
  minCredits: number;
}

export const DEFAULT_RAFFLE: RaffleSettings = { minCredits: 1 };

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
  at: Date;
  voided: boolean;
  /** The prize's image when it was drawn, for the stage (answered by a draw, never stored with it). */
  prizeImageUrl?: string | null;
}

/** A cadet as the raffle sees them: their G-Credits earned in this edition are their tickets. */
export interface Entrant {
  uid: string;
  alias: string;
  squadId: string | null;
  credits: number;
}

export type NewDraw = Omit<RaffleDraw, "id" | "prizeId" | "prizeName" | "voided" | "prizeImageUrl">;

export interface RaffleStore {
  settings(): Promise<Result<RaffleSettings | null, { code: string }>>;
  saveSettings(settings: RaffleSettings): Promise<Result<void, { code: string }>>;
  prizes(): Promise<Result<readonly RafflePrize[], { code: string }>>;
  createPrize(prize: Omit<RafflePrize, "id">): Promise<Result<RafflePrize, { code: string }>>;
  /** `null` when the prize does not exist. */
  updatePrize(id: string, patch: Partial<Pick<RafflePrize, "name" | "quantity" | "active" | "image">>): Promise<Result<{ before: RafflePrize; after: RafflePrize } | null, { code: string }>>;
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

/** Who can win now: enough tickets, and not a winner of a draw that stands or a voided one (absent). */
export function eligibleEntrants(entrants: readonly Entrant[], settings: RaffleSettings, draws: readonly RaffleDraw[]): Entrant[] {
  const out = new Set(draws.map((draw) => draw.winnerUid));
  return entrants.filter((entrant) => entrant.credits >= Math.max(1, settings.minCredits) && !out.has(entrant.uid));
}

/** One winner, each entrant's chance proportional to their tickets. `null` when nobody can win. */
export function pickWinner(eligible: readonly Entrant[], random: (max: number) => number): Entrant | null {
  const total = eligible.reduce((sum, entrant) => sum + entrant.credits, 0);
  if (total <= 0) return null;
  let ticket = random(total);
  for (const entrant of eligible) {
    if (ticket < entrant.credits) return entrant;
    ticket -= entrant.credits;
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

export interface RaffleOverview {
  settings: RaffleSettings;
  isDefault: boolean;
  prizes: readonly RafflePrize[];
  /** Newest first. */
  draws: readonly RaffleDraw[];
  /** Who could win the next draw, and their tickets. */
  eligible: number;
  tickets: number;
}

/** Everything the admin's raffle screen shows. */
export async function getRaffleOverview(deps: Pick<RaffleDeps, "store" | "entrants">, actor: RaffleActor): Promise<Result<RaffleOverview, { code: RaffleErrorCode }>> {
  if (forbidden(actor)) return fail("forbidden");
  const [settings, prizes, draws, entrants] = await Promise.all([currentSettings(deps), deps.store.prizes(), deps.store.draws(), deps.entrants.list()]);
  if (!settings.ok || !prizes.ok || !draws.ok || !entrants.ok) return fail("unknown");
  const eligible = eligibleEntrants(entrants.value, settings.value.settings, draws.value);
  return ok({
    ...settings.value,
    prizes: [...prizes.value].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    draws: [...draws.value].sort((a, b) => b.at.getTime() - a.at.getTime()),
    eligible: eligible.length,
    tickets: eligible.reduce((sum, entrant) => sum + entrant.credits, 0),
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

export async function createRafflePrize(deps: RaffleDeps, actor: RaffleActor, input: { name: unknown; quantity: unknown; imagePath?: unknown }): Promise<Result<RafflePrize, { code: RaffleErrorCode }>> {
  if (forbidden(actor)) return fail("forbidden");
  const name = prizeName(input.name);
  if (!name) return fail("invalid-name");
  if (!whole(input.quantity, 1, PRIZE_QUANTITY_MAX)) return fail("invalid-quantity");
  const image = chooseImage(deps.images, "raffle-prize", input.imagePath);
  if (!image) return fail("invalid-image");
  const listed = await deps.store.prizes();
  if (!listed.ok) return fail("unknown");
  const order = Math.max(-1, ...listed.value.map((prize) => prize.order)) + 1;
  const created = await deps.store.createPrize({ name, quantity: input.quantity, awarded: 0, drawSeq: 0, active: true, order, image: image.keep ? null : image.image });
  if (!created.ok) return fail("unknown");
  await audit(deps, actor, "raffle.prize.created", created.value.id, { name, quantity: String(input.quantity) });
  return ok(created.value);
}

export async function updateRafflePrize(
  deps: RaffleDeps,
  actor: RaffleActor,
  input: { id: string; name?: unknown; quantity?: unknown; active?: unknown; imagePath?: unknown },
): Promise<Result<RafflePrize, { code: RaffleErrorCode }>> {
  if (forbidden(actor)) return fail("forbidden");
  const patch: Partial<Pick<RafflePrize, "name" | "quantity" | "active" | "image">> = {};
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
  const changed = [...(["name", "quantity", "active"] as const).filter((field) => before[field] !== after[field]), ...(before.image?.path === after.image?.path ? [] : ["image"])];
  if (changed.length > 0) await audit(deps, actor, "raffle.prize.updated", input.id, { changed: changed.join(","), name: after.name });
  return ok(after);
}

/**
 * Draws the next unit of a prize: a winner among the cadets with enough tickets who have not won (or been voided),
 * weighted by tickets, with a cryptographic random number. Recorded and audited, then shown on the stage (a stage
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
    const eligible = eligibleEntrants(entrants.value, settings.value.settings, draws);
    const winner = pickWinner(eligible, deps.random);
    if (!winner) return fail("no-entrants");
    reel = buildReel(eligible, winner, deps.random);
    return ok({
      winnerUid: winner.uid,
      winnerAlias: winner.alias,
      winnerSquadId: winner.squadId,
      tickets: winner.credits,
      totalTickets: eligible.reduce((sum, entrant) => sum + entrant.credits, 0),
      entrants: eligible.length,
      at: deps.now(),
    });
  });
  if (!drawn.ok) return drawn;

  await audit(deps, actor, "raffle.drawn", drawn.value.id, {
    prize: drawn.value.prizeName,
    winner: drawn.value.winnerUid,
    tickets: `${drawn.value.tickets}/${drawn.value.totalTickets}`,
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
