import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { getFleetBoard, type BoardCadet, type FleetBoard, type LeaderboardDeps, type SquadStanding } from "./ranking";

/**
 * What the stage screen shows, set by the admin from "Escenario": the ranking (live or frozen at a moment), a
 * waiting screen, or the champions' reveal; and which ranking (cadets, squads or both alternating). One document
 * per edition, which the stage screen listens to.
 */
export const STAGE_DISPLAYS = ["ranking", "waiting", "reveal", "raffle"] as const;
export type StageDisplay = (typeof STAGE_DISPLAYS)[number];
export const STAGE_VIEWS = ["cadets", "squads", "both"] as const;
export type StageView = (typeof STAGE_VIEWS)[number];

export interface StageChampions {
  cadet: BoardCadet | null;
  squad: SquadStanding | null;
}

/** A raffle draw on the stage: the prize, the winner, and the names to spin through before landing on them. */
export interface StageRaffle {
  drawId: string;
  prizeName: string;
  /** The prize's photo, when it has one. */
  prizeImageUrl: string | null;
  winner: { alias: string; squad: string | null };
  tickets: number;
  totalTickets: number;
  /** Other entrants' aliases, the winner's last. */
  reel: readonly string[];
  at: Date;
}

export interface StageState {
  display: StageDisplay;
  view: StageView;
  /** The ranking as it stood when the admin froze it; `null` while the ranking is live. */
  frozen: (FleetBoard & { at: Date }) | null;
  /** The champions revealed; kept until the stage goes back to the ranking. */
  champions: StageChampions | null;
  /** The raffle draw on screen; kept until the stage goes back to the ranking. */
  raffle: StageRaffle | null;
}

export const DEFAULT_STAGE: StageState = { display: "ranking", view: "both", frozen: null, champions: null, raffle: null };

/** What the admin can do from "Escenario". */
export type StageCommand =
  | { type: "show"; display: "ranking" | "waiting" }
  | { type: "view"; view: StageView }
  | { type: "freeze" }
  | { type: "unfreeze" }
  | { type: "reveal" };

export interface StageStore {
  /** `null` while the edition has none saved. */
  read(): Promise<Result<StageState | null, { code: string }>>;
  save(state: StageState): Promise<Result<void, { code: string }>>;
}

export interface StageDeps extends LeaderboardDeps {
  stage: StageStore;
  audit: {
    append(entry: { action: "stage.updated"; actorUid: string; targetUid: string; details: Record<string, string | null>; at: Date }): Promise<Result<void, { code: string }>>;
  };
  now: () => Date;
}

export type StageErrorCode = "invalid-command" | "not-frozen" | "unauthenticated" | "forbidden" | "disabled" | "unknown";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A command from the admin's request, or `null` when it is not one. */
export function parseStageCommand(input: unknown): StageCommand | null {
  if (!isRecord(input)) return null;
  switch (input.type) {
    case "show":
      return input.display === "ranking" || input.display === "waiting" ? { type: "show", display: input.display } : null;
    case "view":
      return (STAGE_VIEWS as readonly unknown[]).includes(input.view) ? { type: "view", view: input.view as StageView } : null;
    case "freeze":
    case "unfreeze":
    case "reveal":
      return { type: input.type };
    default:
      return null;
  }
}

/** The champions of a board: the first cadet and the first squad (none when nobody has XP yet). */
export const championsOf = (board: FleetBoard): StageChampions => ({
  cadet: board.cadets[0] ?? null,
  squad: board.squads.find((squad) => squad.xp > 0) ?? null,
});

/** The stage as the edition left it, or as it starts (the live ranking, both views). */
export async function getStage(deps: Pick<StageDeps, "stage">): Promise<Result<StageState, { code: StageErrorCode }>> {
  const read = await deps.stage.read();
  if (!read.ok) return err({ code: "unknown" });
  return ok(read.value ?? DEFAULT_STAGE);
}

/** What one command does to the stage. Freezing and revealing read the ranking as it stands. */
async function apply(deps: StageDeps, state: StageState, command: StageCommand): Promise<Result<StageState, { code: StageErrorCode }>> {
  switch (command.type) {
    case "show":
      // Leaving the reveal puts the ranking back; the champions stay only while revealed.
      return ok({ ...state, display: command.display, champions: null, raffle: null });
    case "view":
      return ok({ ...state, view: command.view });
    case "freeze": {
      // Freezing again keeps the first moment: the ranking the audience already saw stays.
      if (state.frozen) return ok(state);
      const board = await getFleetBoard(deps);
      if (!board.ok) return err({ code: "unknown" });
      return ok({ ...state, frozen: { ...board.value, at: deps.now() } });
    }
    case "unfreeze":
      if (!state.frozen) return err({ code: "not-frozen" });
      return ok({ ...state, frozen: null });
    case "reveal": {
      // Champions come from the frozen ranking when there is one, so the reveal matches what was on screen.
      if (state.frozen) return ok({ ...state, display: "reveal", champions: championsOf(state.frozen), raffle: null });
      const board = await getFleetBoard(deps);
      if (!board.ok) return err({ code: "unknown" });
      return ok({ ...state, display: "reveal", champions: championsOf(board.value), raffle: null });
    }
  }
}

/** Runs one admin command on the stage; audited. */
export async function updateStage(deps: StageDeps, actor: { uid: string; role: string | null }, input: unknown): Promise<Result<StageState, { code: StageErrorCode }>> {
  if (actor.role !== "admin") return err({ code: "forbidden" });
  const command = parseStageCommand(input);
  if (!command) return err({ code: "invalid-command" });

  const current = await getStage(deps);
  if (!current.ok) return current;
  const next = await apply(deps, current.value, command);
  if (!next.ok) return next;
  if (next.value === current.value) return next;

  const saved = await deps.stage.save(next.value);
  if (!saved.ok) return err({ code: "unknown" });
  const written = await deps.audit.append({
    action: "stage.updated",
    actorUid: actor.uid,
    targetUid: "stage",
    details: { command: command.type, display: next.value.display, view: next.value.view, frozen: next.value.frozen ? "yes" : "no" },
    at: deps.now(),
  });
  if (!written.ok) logServerError("stage.audit.append", new Error("audit entry missing for stage.updated"));
  return next;
}

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (isRecord(value) && typeof value.toDate === "function") return (value.toDate as () => Date)();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value);
  return null;
};
const whole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

function parseCadet(input: unknown): BoardCadet | null {
  if (!isRecord(input) || !whole(input.position) || typeof input.alias !== "string" || !whole(input.xp)) return null;
  return { position: input.position, alias: input.alias, squad: typeof input.squad === "string" ? input.squad : null, xp: input.xp };
}

function parseSquad(input: unknown): SquadStanding | null {
  if (!isRecord(input) || !whole(input.position) || typeof input.id !== "string" || typeof input.name !== "string" || !whole(input.xp) || !whole(input.members)) return null;
  return { position: input.position, id: input.id, name: input.name, xp: input.xp, members: input.members };
}

const parseAll = <T,>(input: unknown, parse: (item: unknown) => T | null): T[] | null => {
  if (!Array.isArray(input)) return null;
  const items = input.map(parse);
  return items.every((item) => item !== null) ? (items as T[]) : null;
};

/**
 * The stage from stored data (the server's Admin SDK or the stage screen's own listener), or `null` when it breaks
 * the rules. Dates may come as Firestore timestamps, dates or ISO text.
 */
export function parseStageState(input: unknown): StageState | null {
  if (!isRecord(input)) return null;
  if (!(STAGE_DISPLAYS as readonly unknown[]).includes(input.display) || !(STAGE_VIEWS as readonly unknown[]).includes(input.view)) return null;

  let frozen: StageState["frozen"] = null;
  if (input.frozen !== null && input.frozen !== undefined) {
    if (!isRecord(input.frozen)) return null;
    const cadets = parseAll(input.frozen.cadets, parseCadet);
    const squads = parseAll(input.frozen.squads, parseSquad);
    const at = toDate(input.frozen.at);
    if (!cadets || !squads || !at) return null;
    frozen = { cadets, squads, at };
  }

  let champions: StageChampions | null = null;
  if (input.champions !== null && input.champions !== undefined) {
    if (!isRecord(input.champions)) return null;
    const cadet = input.champions.cadet === null ? null : parseCadet(input.champions.cadet);
    const squad = input.champions.squad === null ? null : parseSquad(input.champions.squad);
    if ((input.champions.cadet !== null && !cadet) || (input.champions.squad !== null && !squad)) return null;
    champions = { cadet, squad };
  }
  let raffle: StageRaffle | null = null;
  if (input.raffle !== null && input.raffle !== undefined) {
    raffle = parseRaffle(input.raffle);
    if (!raffle) return null;
  }
  return { display: input.display as StageDisplay, view: input.view as StageView, frozen, champions, raffle };
}

/** Only the app's own images (`/media/…`) or a web address are shown on the projector; anything else leaves the prize without a photo. */
const imageUrl = (value: unknown): string | null => (typeof value === "string" && /^(?:\/media\/|https?:\/\/)/.test(value) && value.length <= 600 ? value : null);

function parseRaffle(input: unknown): StageRaffle | null {
  if (!isRecord(input) || !isRecord(input.winner)) return null;
  const at = toDate(input.at);
  const { drawId, prizeName, tickets, totalTickets, reel } = input;
  if (typeof drawId !== "string" || typeof prizeName !== "string" || !whole(tickets) || !whole(totalTickets) || !at) return null;
  if (typeof input.winner.alias !== "string" || !Array.isArray(reel) || !reel.every((name) => typeof name === "string")) return null;
  return {
    drawId,
    prizeName,
    prizeImageUrl: imageUrl(input.prizeImageUrl),
    winner: { alias: input.winner.alias, squad: typeof input.winner.squad === "string" ? input.winner.squad : null },
    tickets,
    totalTickets,
    reel: reel as string[],
    at,
  };
}

/** What the raffle feature hands the stage for one draw. */
export interface RaffleShowing {
  drawId: string;
  prizeName: string;
  prizeImageUrl: string | null;
  winnerAlias: string;
  winnerSquadId: string | null;
  tickets: number;
  totalTickets: number;
  reel: readonly string[];
  at: Date;
}

/**
 * Puts a raffle draw on the stage (the raffle feature calls it right after a draw it already authorized and
 * audited). The winner's squad is named here; the champions' reveal, if any, gives way to the draw.
 */
export async function presentRaffle(deps: Pick<StageDeps, "stage" | "squads">, showing: RaffleShowing): Promise<Result<StageState, { code: StageErrorCode }>> {
  const current = await getStage(deps);
  if (!current.ok) return current;
  const squads = await deps.squads.list();
  const squad = showing.winnerSquadId && squads.ok ? (squads.value.find((candidate) => candidate.id === showing.winnerSquadId)?.name ?? null) : null;
  const next: StageState = {
    ...current.value,
    display: "raffle",
    champions: null,
    raffle: {
      drawId: showing.drawId,
      prizeName: showing.prizeName,
      prizeImageUrl: imageUrl(showing.prizeImageUrl),
      winner: { alias: showing.winnerAlias, squad },
      tickets: showing.tickets,
      totalTickets: showing.totalTickets,
      reel: [...showing.reel],
      at: showing.at,
    },
  };
  const saved = await deps.stage.save(next);
  return saved.ok ? ok(next) : err({ code: "unknown" });
}
