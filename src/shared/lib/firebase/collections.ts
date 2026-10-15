import type { Firestore } from "firebase-admin/firestore";

/**
 * Firestore layout. Everything that belongs to one edition of the event lives under
 * `events/{eventId}`, so the same database serves several editions and old ones stay untouched:
 *
 *   config/app                          activeEventId (which edition the app serves)
 *   events/{eventId}/participants/{uid} profile, xp, credits, squad, attendedAt
 *   events/{eventId}/aliases/{alias}    alias reservations (unique per edition)
 *   events/{eventId}/checkpoints/{id}   entrance, talks, catering
 *   events/{eventId}/checkins/{uid}_{checkpointId}   idempotency key
 *
 * A collection can be read by several features, but each field has one owner (documented in
 * docs/architecture.md): the attendee feature owns alias, role, xp and credits; the squads feature
 * owns `squad`; the check-ins feature owns `attendedAt`.
 */
export const CONFIG_COLLECTION = "config";
export const APP_CONFIG_DOC = "app";
export const EVENTS_COLLECTION = "events";

export const PARTICIPANTS_COLLECTION = "participants";
export const ALIASES_COLLECTION = "aliases";
/** Server-written records of what an attendee scanned. Document id: `{uid}_{checkpointId}`. */
export const CHECKINS_COLLECTION = "checkins";
/** Checkpoint catalog. Managed from the admin in phase 2. */
export const CHECKPOINTS_COLLECTION = "checkpoints";

/** The squads of one edition, maintained by admins. */
export const SQUADS_COLLECTION = "squads";

/** The galactic quadrants of one edition (one per Google technology area). */
export const QUADRANTS_COLLECTION = "quadrants";
/** The venue plan of one edition: a single document, `venue/map`. */
export const VENUE_COLLECTION = "venue";
export const VENUE_MAP_DOC = "map";

/** The missions of one edition. */
export const MISSIONS_COLLECTION = "missions";
/** What each attendee did with each mission. Document id: `{uid}_{missionId}`. */
export const MISSION_COMPLETIONS_COLLECTION = "missionCompletions";
/** Every XP grant, once per attendee and source. Document id: `{uid}_{source}`. */
export const XP_LEDGER_COLLECTION = "xpLedger";

/** Settings of one edition that admins edit, one document each (`config/ranks`: the rank ladder). */
export const EVENT_CONFIG_COLLECTION = "config";
export const RANKS_DOC = "ranks";

/** The transmissions of the story of one edition; its title lives in `config/story`. */
export const COMMUNICATIONS_COLLECTION = "communications";
export const STORY_DOC = "story";

/** Squad credits of one edition: each squad's wallet, its ledger, the prizes and the redemptions. */
export const SQUAD_WALLETS_COLLECTION = "squadWallets";
export const SQUAD_LEDGER_COLLECTION = "squadLedger";
export const SQUAD_PRIZES_COLLECTION = "squadPrizes";
export const SQUAD_REDEMPTIONS_COLLECTION = "squadRedemptions";

/** Achievements of one edition: the badges and who earned each one (`{uid}_{badgeId}`). */
export const ACHIEVEMENTS_COLLECTION = "achievements";
export const ACHIEVEMENT_AWARDS_COLLECTION = "achievementAwards";

/** One play of a mission's mini-game per attendee (`{uid}_{missionId}`): the single-use ticket and its result. */
export const MINIGAME_PLAYS_COLLECTION = "minigamePlays";

/** The cadet network of one edition: one contact per pair of cadets (`{uidA}_{uidB}`, sorted) and each cadet's opt-in links (`{uid}`). */
export const CONTACTS_COLLECTION = "contacts";
export const CONTACT_CARDS_COLLECTION = "contactCards";

/** The final raffle of one edition: its prizes and every draw (`{prizeId}-{number}`). Settings live in `config/raffle`. */
export const RAFFLE_PRIZES_COLLECTION = "rafflePrizes";
export const RAFFLE_DRAWS_COLLECTION = "raffleDraws";

/** Staff and organizers of one edition (`events/{eventId}/team/{uid}`); admins stay in the global `team`. */
export const EDITION_TEAM_COLLECTION = "team";
/** Invitations to the team of one edition (`events/{eventId}/invites/{hash of the link}`). */
export const INVITES_COLLECTION = "invites";

export type EventCollection =
  | typeof RAFFLE_PRIZES_COLLECTION
  | typeof RAFFLE_DRAWS_COLLECTION
  | typeof CONTACTS_COLLECTION
  | typeof CONTACT_CARDS_COLLECTION
  | typeof MINIGAME_PLAYS_COLLECTION
  | typeof ACHIEVEMENTS_COLLECTION
  | typeof ACHIEVEMENT_AWARDS_COLLECTION
  | typeof SQUAD_WALLETS_COLLECTION
  | typeof SQUAD_LEDGER_COLLECTION
  | typeof SQUAD_PRIZES_COLLECTION
  | typeof SQUAD_REDEMPTIONS_COLLECTION
  | typeof COMMUNICATIONS_COLLECTION
  | typeof EVENT_CONFIG_COLLECTION
  | typeof MISSIONS_COLLECTION
  | typeof MISSION_COMPLETIONS_COLLECTION
  | typeof XP_LEDGER_COLLECTION
  | typeof QUADRANTS_COLLECTION
  | typeof VENUE_COLLECTION
  | typeof SQUADS_COLLECTION
  | typeof PARTICIPANTS_COLLECTION
  | typeof ALIASES_COLLECTION
  | typeof CHECKINS_COLLECTION
  | typeof CHECKPOINTS_COLLECTION
  | typeof EDITION_TEAM_COLLECTION
  | typeof INVITES_COLLECTION;

/** The document of one edition itself (its name and when it ends). */
export function eventDocument(db: Firestore, eventId: string) {
  return db.collection(EVENTS_COLLECTION).doc(eventId);
}

/** A collection of one edition: the only way adapters reach per-event data. */
export function eventCollection(db: Firestore, eventId: string, name: EventCollection) {
  return db.collection(EVENTS_COLLECTION).doc(eventId).collection(name);
}

/** People with a privileged role (staff, admin). Global: not tied to one edition. */
export const TEAM_COLLECTION = "team";
/** Append-only trail of admin actions. Global. */
export const AUDIT_COLLECTION = "audit";
/** Each person's G-Credits across every edition (`wallets/{uid}`: balance, earned, spent). Global. */
export const WALLETS_COLLECTION = "wallets";
/** Every G-Credit in and out of the wallets, each tagged with its edition. Global. */
export const WALLET_LEDGER_COLLECTION = "walletLedger";
/** Uploaded images (`images/{path with / as ~}`), large ones split into an `images/{id}/chunks` subcollection. Global: the path names the edition. */
export const IMAGES_COLLECTION = "images";
export const IMAGE_CHUNKS_COLLECTION = "chunks";
/** The economy settings of one edition: `events/{eventId}/config/economy`. */
export const ECONOMY_DOC = "economy";
