import { err, ok, type Result } from "@/shared/lib/result";
import { MINIGAMES, isDifficulty, isMinigameId, ticketSeconds, type CodeLanguage, type Difficulty, type MinigameId } from "./catalog";
import type { MinigameSettings } from "./settings";

/**
 * One attendee's single play of a mission's mini-game (`minigamePlays/{uid}_{missionId}`). The server issues it
 * (the ticket), the phone reports won or lost once (chosen by the organizer), and a win pays the mission's
 * earned XP again through the ledger.
 */
export type PlayStatus = "started" | "won" | "lost";

export interface MinigamePlay {
  uid: string;
  missionId: string;
  gameId: MinigameId;
  difficulty: Difficulty;
  status: PlayStatus;
  /** XP a win pays: what the mission earned when the ticket was issued. */
  xpBonus: number;
  startedAt: Date;
  expiresAt: Date;
  finishedAt: Date | null;
}

export const playId = (uid: string, missionId: string) => `${uid}_${missionId}`;

/** What the server knows about a mission for one attendee: its game, and whether they completed it. */
export interface MissionBonusInfo {
  /** The game the admin assigned, or `null`. */
  minigame: string | null;
  /** The mission's own difficulty, or `null` to use the edition's for that game. */
  difficulty: Difficulty | null;
  active: boolean;
  completed: boolean;
  xpEarned: number;
}

export interface PlayStore {
  find(uid: string, missionId: string): Promise<Result<MinigamePlay | null, { code: string }>>;
  /** Creates the play unless one exists, in one transaction; answers the stored one either way. */
  start(play: MinigamePlay): Promise<Result<{ play: MinigamePlay; created: boolean }, { code: string }>>;
  /** Reads the play and stores what `decide` returns, in one transaction (`null` changes nothing). */
  finish(uid: string, missionId: string, decide: (current: MinigamePlay | null) => MinigamePlay | null): Promise<Result<MinigamePlay | null, { code: string }>>;
}

export interface MinigameDeps {
  plays: PlayStore;
  missions: { bonusInfo(uid: string, missionId: string): Promise<Result<MissionBonusInfo | null, { code: string }>> };
  settings: () => Promise<MinigameSettings>;
  ledger: { grant(grant: { uid: string; source: `minigame:${string}`; xp: number; credits: number }): Promise<Result<{ granted: boolean }, { code: string }>> };
  now: () => Date;
}

export type MinigameErrorCode =
  /** The mission has no enabled game, is not completed, or earned no XP to double. */
  | "not-available"
  /** The single attempt was used. */
  | "already-played"
  /** A result without a ticket. */
  | "no-ticket"
  | "not-registered"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface MinigameOffer {
  gameId: MinigameId;
  difficulty: Difficulty;
  /** `available` before the attempt, `in-play` while a ticket is valid, then its result. */
  state: "available" | "in-play" | "won" | "lost";
  xpBonus: number;
}

export interface MinigameTicket {
  gameId: MinigameId;
  difficulty: Difficulty;
  expiresAt: Date;
  /** For "Ordena el código": the languages the edition uses. */
  codeLanguages: readonly CodeLanguage[];
}

/** A ticket nobody finished before it expired counts as lost. */
const stateOf = (play: MinigamePlay, now: Date): MinigameOffer["state"] => {
  if (play.status !== "started") return play.status;
  return now.getTime() < play.expiresAt.getTime() ? "in-play" : "lost";
};

/** The game a completed mission offers this attendee, with its difficulty; `null` when it offers none. */
async function availableGame(deps: MinigameDeps, uid: string, missionId: string): Promise<Result<{ gameId: MinigameId; difficulty: Difficulty; xpBonus: number; settings: MinigameSettings } | null, { code: "unknown" }>> {
  const [info, settings] = await Promise.all([deps.missions.bonusInfo(uid, missionId), deps.settings()]);
  if (!info.ok) return err({ code: "unknown" });
  const mission = info.value;
  if (!mission || !mission.active || !mission.completed || mission.xpEarned <= 0 || !isMinigameId(mission.minigame)) return ok(null);
  const game = settings.games[mission.minigame];
  if (!game.enabled) return ok(null);
  return ok({ gameId: mission.minigame, difficulty: isDifficulty(mission.difficulty) ? mission.difficulty : game.difficulty, xpBonus: mission.xpEarned, settings });
}

/**
 * What the mission screen offers after a completion: "Jugar por XP x2" while the attempt is unused, the game in
 * play, or how it went. A play already made is shown even if the game was disabled afterwards.
 */
export async function getMinigameOffer(deps: MinigameDeps, uid: string, missionId: string): Promise<Result<MinigameOffer | null, { code: "unknown" }>> {
  const [game, play] = await Promise.all([availableGame(deps, uid, missionId), deps.plays.find(uid, missionId)]);
  if (!game.ok || !play.ok) return err({ code: "unknown" });
  const now = deps.now();
  if (play.value) return ok({ gameId: play.value.gameId, difficulty: play.value.difficulty, state: stateOf(play.value, now), xpBonus: play.value.xpBonus });
  if (!game.value) return ok(null);
  return ok({ gameId: game.value.gameId, difficulty: game.value.difficulty, state: "available", xpBonus: game.value.xpBonus });
}

/**
 * Issues the single ticket for a mission's game. A ticket still valid is handed back (a reload is not a second
 * attempt); a used or expired one is refused. The XP a win would pay is fixed now, from the completion.
 */
export async function startMinigame(deps: MinigameDeps, uid: string, missionId: string): Promise<Result<MinigameTicket, { code: MinigameErrorCode }>> {
  const game = await availableGame(deps, uid, missionId);
  if (!game.ok) return err({ code: "unknown" });
  if (!game.value) return err({ code: "not-available" });

  const now = deps.now();
  const { gameId, difficulty, xpBonus, settings } = game.value;
  const started = await deps.plays.start({
    uid,
    missionId,
    gameId,
    difficulty,
    status: "started",
    xpBonus,
    startedAt: now,
    expiresAt: new Date(now.getTime() + ticketSeconds(gameId, difficulty) * 1000),
    finishedAt: null,
  });
  if (!started.ok) return err({ code: "unknown" });
  const { play, created } = started.value;
  if (!created && stateOf(play, now) !== "in-play") return err({ code: "already-played" });
  return ok({ gameId: play.gameId, difficulty: play.difficulty, expiresAt: play.expiresAt, codeLanguages: settings.codeLanguages });
}

/**
 * How a ticket ends, decided on the server: the phone's result counts only within the ticket's time and not
 * sooner than the game's minimum (either way it is lost). A finished play never changes.
 */
export function decideFinish(current: MinigamePlay | null, won: boolean, now: Date): MinigamePlay | null {
  if (!current || current.status !== "started") return null;
  const elapsed = (now.getTime() - current.startedAt.getTime()) / 1000;
  const inTime = now.getTime() <= current.expiresAt.getTime() && elapsed >= MINIGAMES[current.gameId].minSeconds;
  return { ...current, status: won && inTime ? "won" : "lost", finishedAt: now };
}

/**
 * Takes the phone's result for a ticket, once. A win pays the bonus through the ledger, once per mission (the
 * source `minigame:{missionId}`); a repeated call after a win retries a payment that failed and changes nothing
 * else.
 */
export async function finishMinigame(
  deps: MinigameDeps,
  uid: string,
  input: { missionId: string; won: boolean },
): Promise<Result<{ status: "won" | "lost"; xpBonus: number }, { code: MinigameErrorCode }>> {
  const now = deps.now();
  const finished = await deps.plays.finish(uid, input.missionId, (current) => decideFinish(current, input.won, now));
  if (!finished.ok) return err({ code: "unknown" });
  const play = finished.value;
  if (!play) return err({ code: "no-ticket" });
  const status = stateOf(play, now);
  if (status !== "won") return ok({ status: "lost", xpBonus: 0 });

  const granted = await deps.ledger.grant({ uid, source: `minigame:${input.missionId}`, xp: play.xpBonus, credits: 0 });
  if (!granted.ok) return err({ code: granted.error.code === "not-registered" ? "not-registered" : "unknown" });
  return ok({ status: "won", xpBonus: play.xpBonus });
}
