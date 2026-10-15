import { chooseImage, dropReplacedImage, type ImageRef, type RecordImages } from "@/features/media/constants";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";

/**
 * Squad credits: a currency of each squad in one edition, separate from its members' G-Credits. Squads
 * earn them when members earn G-Credits (the ratio in Economía) and from admin bonuses, and spend them only
 * on prizes the admin defines, redeemed by the admin.
 */

/** Squad credits for a member's G-Credits at the edition's ratio, rounded down. */
export const squadShare = (credits: number, ratio: number) => (credits > 0 && ratio > 0 ? Math.floor(credits * ratio) : 0);

export interface SquadPrize {
  id: string;
  name: string;
  description: string;
  cost: number;
  /** How many are left, or `null` for no limit. */
  stock: number | null;
  active: boolean;
  order: number;
  /** A photo of the prize, for the admin and the squad's members. */
  image: ImageRef | null;
}

export interface SquadWallet {
  squadId: string;
  balance: number;
  earned: number;
  spent: number;
}

export interface SquadRedemption {
  id: string;
  squadId: string;
  prizeId: string;
  prizeName: string;
  cost: number;
  actorUid: string;
  at: Date;
}

export const PRIZE_COST_MAX = 1_000_000;
export const BONUS_MAX = 100_000;
const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
const OPERATION = /^[A-Za-z0-9_-]{8,80}$/;

export type SquadCreditsErrorCode =
  | "invalid-id"
  | "invalid-name"
  | "invalid-description"
  | "invalid-cost"
  | "invalid-stock"
  | "invalid-image"
  | "invalid-amount"
  | "invalid-reason"
  | "invalid-operation"
  | "unknown-squad"
  | "already-exists"
  | "not-found"
  | "inactive"
  | "insufficient"
  | "out-of-stock"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

type Checked<T> = { ok: true; value: T } | { ok: false; code: SquadCreditsErrorCode };
const fail = (code: SquadCreditsErrorCode) => ({ ok: false, code }) as const;
const text = (value: unknown, min: number, max: number) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
};

/** Checks a prize from stored or admin-submitted data and says which field is wrong. */
export function checkPrize(id: string, input: unknown): Checked<SquadPrize> {
  if (!SLUG.test(id)) return fail("invalid-id");
  if (typeof input !== "object" || input === null) return fail("invalid-name");
  const data = input as Record<string, unknown>;
  const name = text(data.name, 2, 60);
  if (!name) return fail("invalid-name");
  const description = data.description === undefined ? "" : text(data.description, 0, 200);
  if (description === null) return fail("invalid-description");
  const { cost, stock } = data;
  if (typeof cost !== "number" || !Number.isInteger(cost) || cost < 1 || cost > PRIZE_COST_MAX) return fail("invalid-cost");
  if (stock !== null && stock !== undefined && (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0 || stock > 100_000)) return fail("invalid-stock");
  return {
    ok: true,
    value: {
      id,
      name,
      description,
      cost,
      stock: typeof stock === "number" ? stock : null,
      active: data.active === true,
      order: typeof data.order === "number" && Number.isFinite(data.order) ? data.order : Number.MAX_SAFE_INTEGER,
      // Stored as a path; the data layer turns it into a reference with its address.
      image: null,
    },
  };
}

export const parsePrize = (id: string, input: unknown): SquadPrize | null => {
  const checked = checkPrize(id, input);
  return checked.ok ? checked.value : null;
};

export type PrizePatch = Partial<Pick<SquadPrize, "name" | "description" | "cost" | "stock" | "active" | "image">>;

export interface SquadCreditsStore {
  wallets(): Promise<Result<readonly SquadWallet[], { code: string }>>;
  wallet(squadId: string): Promise<Result<SquadWallet, { code: string }>>;
  /** Adds a bonus once per operation (a repeated operation changes nothing). */
  addBonus(input: { squadId: string; amount: number; reason: string; operationId: string; actorUid: string }): Promise<Result<{ added: boolean; balance: number }, { code: string }>>;
  prizes(): Promise<Result<readonly SquadPrize[], { code: string }>>;
  createPrize(prize: SquadPrize): Promise<Result<void, { code: "already-exists" | "unknown" }>>;
  updatePrize(id: string, patch: PrizePatch): Promise<Result<{ before: SquadPrize; after: SquadPrize } | null, { code: string }>>;
  /**
   * Redeems a prize for a squad once per operation, in one transaction: the prize must be active and in
   * stock, the squad must afford it; the cost is debited and the stock decremented.
   */
  redeem(input: { squadId: string; prizeId: string; operationId: string; actorUid: string }): Promise<
    Result<{ redeemed: boolean; balance: number }, { code: "not-found" | "inactive" | "insufficient" | "out-of-stock" | "unknown" }>
  >;
  redemptions(limit: number): Promise<Result<readonly SquadRedemption[], { code: string }>>;
}

export interface SquadCreditsDeps {
  store: SquadCreditsStore;
  /** The edition's squads (the squads feature answers it), active or not. */
  squads: { list(): Promise<Result<ReadonlyArray<{ id: string; name: string; active: boolean }>, { code: string }>> };
  images: RecordImages;
  audit: {
    append(entry: {
      action: "squad.bonus" | "squad.prize.created" | "squad.prize.updated" | "squad.prize.activated" | "squad.prize.deactivated" | "squad.redeemed";
      actorUid: string;
      targetUid: string;
      details: Record<string, string | null>;
      at: Date;
    }): Promise<Result<void, { code: string }>>;
  };
  now: () => Date;
}

export interface SquadCreditsActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

const forbidden = (actor: SquadCreditsActor) => actor.role !== "admin";
const byOrder = (a: SquadPrize, b: SquadPrize) => a.order - b.order || a.cost - b.cost || a.name.localeCompare(b.name);

async function audit(deps: SquadCreditsDeps, entry: Parameters<SquadCreditsDeps["audit"]["append"]>[0]): Promise<void> {
  const written = await deps.audit.append(entry);
  if (!written.ok) logServerError("squadCredits.audit.append", new Error(`audit entry missing for ${entry.targetUid}`));
}

/** What a squad's members see: its balance and the active prizes, cheapest first. */
export async function getSquadStanding(
  deps: { store: Pick<SquadCreditsStore, "wallet" | "prizes"> },
  squadId: string,
): Promise<Result<{ wallet: SquadWallet; prizes: readonly SquadPrize[] }, { code: SquadCreditsErrorCode }>> {
  const [wallet, prizes] = await Promise.all([deps.store.wallet(squadId), deps.store.prizes()]);
  if (!wallet.ok || !prizes.ok) return err({ code: "unknown" });
  return ok({ wallet: wallet.value, prizes: prizes.value.filter((prize) => prize.active && prize.stock !== 0).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name)) });
}

export interface SquadCreditsOverview {
  squads: ReadonlyArray<{ id: string; name: string; active: boolean; wallet: SquadWallet }>;
  prizes: readonly SquadPrize[];
  redemptions: readonly SquadRedemption[];
}

/** The admin view: every squad with its balance, the prizes in order, and the latest redemptions. */
export async function getSquadCreditsOverview(deps: SquadCreditsDeps, actor: SquadCreditsActor): Promise<Result<SquadCreditsOverview, { code: SquadCreditsErrorCode }>> {
  if (forbidden(actor)) return err({ code: "forbidden" });
  const [squads, wallets, prizes, redemptions] = await Promise.all([deps.squads.list(), deps.store.wallets(), deps.store.prizes(), deps.store.redemptions(20)]);
  if (!squads.ok || !wallets.ok || !prizes.ok || !redemptions.ok) return err({ code: "unknown" });
  const empty = (squadId: string): SquadWallet => ({ squadId, balance: 0, earned: 0, spent: 0 });
  return ok({
    squads: squads.value.map((squad) => ({ ...squad, wallet: wallets.value.find((wallet) => wallet.squadId === squad.id) ?? empty(squad.id) })),
    prizes: [...prizes.value].sort(byOrder),
    redemptions: redemptions.value,
  });
}

/** Gives a squad credits for a reason (a stage challenge won, for example). Once per operation id. */
export async function awardSquadBonus(
  deps: SquadCreditsDeps,
  actor: SquadCreditsActor,
  input: { squadId: string; amount: number; reason: string; operationId: string },
): Promise<Result<{ added: boolean; balance: number }, { code: SquadCreditsErrorCode }>> {
  if (forbidden(actor)) return err({ code: "forbidden" });
  if (!Number.isInteger(input.amount) || input.amount < 1 || input.amount > BONUS_MAX) return err({ code: "invalid-amount" });
  const reason = text(input.reason, 3, 120);
  if (!reason) return err({ code: "invalid-reason" });
  if (!OPERATION.test(input.operationId)) return err({ code: "invalid-operation" });

  const squads = await deps.squads.list();
  if (!squads.ok) return err({ code: "unknown" });
  if (!squads.value.some((squad) => squad.id === input.squadId)) return err({ code: "unknown-squad" });

  const added = await deps.store.addBonus({ squadId: input.squadId, amount: input.amount, reason, operationId: input.operationId, actorUid: actor.uid });
  if (!added.ok) return err({ code: "unknown" });
  if (added.value.added) {
    await audit(deps, { action: "squad.bonus", actorUid: actor.uid, targetUid: input.squadId, details: { amount: String(input.amount), reason }, at: deps.now() });
  }
  return ok(added.value);
}

export async function createPrize(
  deps: SquadCreditsDeps,
  actor: SquadCreditsActor,
  input: { id: string; name: string; description: string; cost: number; stock: number | null; imagePath?: string | null },
): Promise<Result<SquadPrize, { code: SquadCreditsErrorCode }>> {
  if (forbidden(actor)) return err({ code: "forbidden" });
  const checked = checkPrize(input.id, { ...input, active: true });
  if (!checked.ok) return err({ code: checked.code });
  const image = chooseImage(deps.images, "squad-prize", input.imagePath);
  if (!image) return err({ code: "invalid-image" });
  const listed = await deps.store.prizes();
  if (!listed.ok) return err({ code: "unknown" });
  const order = Math.max(-1, ...listed.value.map((prize) => prize.order).filter((value) => value < Number.MAX_SAFE_INTEGER)) + 1;

  const prize: SquadPrize = { ...checked.value, order, active: true, image: image.keep ? null : image.image };
  const saved = await deps.store.createPrize(prize);
  if (!saved.ok) return err({ code: saved.error.code === "already-exists" ? "already-exists" : "unknown" });
  await audit(deps, { action: "squad.prize.created", actorUid: actor.uid, targetUid: prize.id, details: { name: prize.name, cost: String(prize.cost) }, at: deps.now() });
  return ok(prize);
}

export async function updatePrize(
  deps: SquadCreditsDeps,
  actor: SquadCreditsActor,
  input: { id: string; name: string; description: string; cost: number; stock: number | null; imagePath?: string | null },
): Promise<Result<SquadPrize, { code: SquadCreditsErrorCode }>> {
  if (forbidden(actor)) return err({ code: "forbidden" });
  const checked = checkPrize(input.id, { ...input, active: true });
  if (!checked.ok) return err({ code: checked.code === "invalid-id" ? "not-found" : checked.code });
  const image = chooseImage(deps.images, "squad-prize", input.imagePath);
  if (!image) return err({ code: "invalid-image" });
  const { name, description, cost, stock } = checked.value;
  const updated = await deps.store.updatePrize(input.id, { name, description, cost, stock, ...(image.keep ? {} : { image: image.image }) });
  if (!updated.ok) return err({ code: "unknown" });
  if (updated.value === null) return err({ code: "not-found" });
  const { before, after } = updated.value;
  await dropReplacedImage(deps.images, before.image, after.image);
  const changed = [...(["name", "description", "cost", "stock"] as const).filter((field) => before[field] !== after[field]), ...(before.image?.path === after.image?.path ? [] : ["image"])];
  if (changed.length > 0) {
    await audit(deps, { action: "squad.prize.updated", actorUid: actor.uid, targetUid: input.id, details: { changed: changed.join(",") }, at: deps.now() });
  }
  return ok(after);
}

export async function setPrizeActive(
  deps: SquadCreditsDeps,
  actor: SquadCreditsActor,
  input: { id: string; active: boolean },
): Promise<Result<SquadPrize, { code: SquadCreditsErrorCode }>> {
  if (forbidden(actor)) return err({ code: "forbidden" });
  const updated = await deps.store.updatePrize(input.id, { active: input.active });
  if (!updated.ok) return err({ code: "unknown" });
  if (updated.value === null) return err({ code: "not-found" });
  if (updated.value.before.active !== input.active) {
    await audit(deps, {
      action: input.active ? "squad.prize.activated" : "squad.prize.deactivated",
      actorUid: actor.uid,
      targetUid: input.id,
      details: { name: updated.value.after.name },
      at: deps.now(),
    });
  }
  return ok(updated.value.after);
}

/** The admin hands a prize to a squad (on stage): debits its cost once per operation id. */
export async function redeemPrize(
  deps: SquadCreditsDeps,
  actor: SquadCreditsActor,
  input: { squadId: string; prizeId: string; operationId: string },
): Promise<Result<{ redeemed: boolean; balance: number }, { code: SquadCreditsErrorCode }>> {
  if (forbidden(actor)) return err({ code: "forbidden" });
  if (!OPERATION.test(input.operationId)) return err({ code: "invalid-operation" });
  const squads = await deps.squads.list();
  if (!squads.ok) return err({ code: "unknown" });
  if (!squads.value.some((squad) => squad.id === input.squadId)) return err({ code: "unknown-squad" });

  const redeemed = await deps.store.redeem({ ...input, actorUid: actor.uid });
  if (!redeemed.ok) return err({ code: redeemed.error.code });
  if (redeemed.value.redeemed) {
    await audit(deps, { action: "squad.redeemed", actorUid: actor.uid, targetUid: input.squadId, details: { prize: input.prizeId }, at: deps.now() });
  }
  return ok(redeemed.value);
}
