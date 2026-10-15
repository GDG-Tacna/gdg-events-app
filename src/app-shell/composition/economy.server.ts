import "server-only";
import { squadStore } from "@/app-shell/composition/squads.server";
import { FirestoreAuditLog } from "@/features/admin/server";
import {
  FirestoreEconomyStore,
  FirestoreSquadCreditsStore,
  FirestoreXpLedger,
  getEconomySettings,
  type EconomyAdminDeps,
  type EconomySettings,
  type SquadCreditsDeps,
} from "@/features/economy/server";
import { currentEditionOf } from "@/features/event/server";
import { ttlCached } from "@/shared/lib/ttl-cache";
import { recordImages } from "./media.server";
import { perEdition } from "./per-edition";

/** The edition's economy settings, kept for a minute; a save drops the cache at once. */
export const economyStore = perEdition(() => new FirestoreEconomyStore());

/** Composition root for the economy settings, edited from the admin "Economía" screen. */
export const economyDeps: EconomyAdminDeps = {
  store: economyStore,
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};

/** The settings that rule this edition (defaults when none are saved or the read fails). */
export const currentEconomy = (): Promise<EconomySettings> => getEconomySettings(economyDeps);

/** Squad credits per G-Credit earned by a member: the edition's ratio, or 0 when squad credits are off. */
const squadRatio = async () => {
  const settings = await currentEconomy();
  return settings.squadCreditsEnabled ? settings.squadRatio : 0;
};

/**
 * The only reward ledger: every XP and G-Credit of the app goes through it (edition XP and credits, each
 * person's global wallet, and their squad's share).
 */
export const rewardLedger = new FirestoreXpLedger(undefined, undefined, undefined, squadRatio);

const squadCreditsStore = new FirestoreSquadCreditsStore();

/** Composition root for squad credits (admin "Créditos de escuadrón"): always the stored values. */
export const squadCreditsDeps: SquadCreditsDeps = {
  store: squadCreditsStore,
  squads: squadStore,
  images: recordImages,
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};

/**
 * The squad card of the dashboard: the balance as stored, the prize list kept for a minute (every member's visit
 * would read it again). A redemption still checks the prize inside its own transaction.
 */
export const squadCardDeps = {
  store: {
    wallet: (squadId: string) => squadCreditsStore.wallet(squadId),
    prizes: ttlCached(() => squadCreditsStore.prizes(), { key: currentEditionOf }),
  },
};
