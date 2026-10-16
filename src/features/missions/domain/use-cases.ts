import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { attemptsLeft, evaluate, type CompletionStatus, type MissionCompletion, type MissionProof } from "./completion";
import { publicConfig, type Mission, type MissionType, type PublicMissionConfig } from "./mission";
import type { AttemptLimiter, CompletionStore, CreditRules, MissionSource, XpGranter } from "./ports";

export type MissionErrorCode =
  | "not-found"
  | "inactive"
  | "wrong-proof"
  | "rate-limited"
  | "not-registered"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface MissionError {
  code: MissionErrorCode;
}

export const missionError = (code: MissionErrorCode): MissionError => ({ code });

/** How a mission looks to one attendee. `status` is `open` while they have not tried it. */
export interface BoardMission {
  id: string;
  title: string;
  description: string;
  quadrantId: string;
  type: MissionType;
  xp: number;
  /** G-Credits it gives under the edition's economy (0 when credits are off). */
  credits: number;
  config: PublicMissionConfig;
  /** The mini-game offered as a bonus once it is done, or `null` (whether the edition has it on is the screen's to check). */
  minigame: string | null;
  /** The mission's uploaded picture, shown instead of the type's icon. */
  imageUrl?: string | null;
  status: "open" | CompletionStatus;
  xpEarned: number;
  creditsEarned: number;
  attemptsLeft: number | null;
}

export interface MissionBoard {
  missions: readonly BoardMission[];
  completed: number;
  total: number;
  xpEarned: number;
  creditsEarned: number;
}

export interface MissionReadDeps {
  source: MissionSource;
  completions: CompletionStore;
  /** The bundled missions, served until the edition saves its own. */
  defaults: readonly Mission[];
  /** The edition's economy; without it missions give no G-Credits. */
  credits?: CreditRules;
}

export interface SubmitProofDeps extends MissionReadDeps {
  xp: XpGranter;
  limiter: AttemptLimiter;
}

const byOrder = (a: Mission, b: Mission) => a.order - b.order || a.title.localeCompare(b.title);

async function offeredMissions(deps: Pick<MissionReadDeps, "source" | "defaults">): Promise<Result<readonly Mission[], MissionError>> {
  const listed = await deps.source.list();
  if (!listed.ok) return err(missionError("unknown"));
  return ok(listed.value.length > 0 ? listed.value : deps.defaults);
}

const creditsOf = (deps: Pick<MissionReadDeps, "credits">, mission: Mission): Promise<number> =>
  deps.credits ? deps.credits.creditsFor(mission.config.type, mission.credits) : Promise.resolve(0);

/** The attendee's missions board: active missions in order, each with what the attendee did with it. */
export async function getMissionBoard(deps: MissionReadDeps, uid: string): Promise<Result<MissionBoard, MissionError>> {
  const [missions, completions] = await Promise.all([offeredMissions(deps), deps.completions.listFor(uid)]);
  if (!missions.ok) return missions;
  if (!completions.ok) return err(missionError("unknown"));

  const byMission = new Map(completions.value.map((completion) => [completion.missionId, completion]));
  const active = missions.value.filter((mission) => mission.active).sort(byOrder);
  const credits = await Promise.all(active.map((mission) => creditsOf(deps, mission)));
  const board = active.map((mission, index): BoardMission => {
      const completion = byMission.get(mission.id) ?? null;
      return {
        id: mission.id,
        title: mission.title,
        description: mission.description,
        quadrantId: mission.quadrantId,
        type: mission.config.type,
        xp: mission.xp,
        credits: credits[index],
        config: publicConfig(mission.config),
        minigame: mission.minigame,
        imageUrl: mission.image?.url ?? null,
        status: completion?.status ?? "open",
        xpEarned: completion?.xpEarned ?? 0,
        creditsEarned: completion?.creditsEarned ?? 0,
        attemptsLeft: attemptsLeft(mission, completion),
      };
    });

  return ok({
    missions: board,
    completed: board.filter((mission) => mission.status === "completed").length,
    total: board.length,
    xpEarned: board.reduce((sum, mission) => sum + mission.xpEarned, 0),
    creditsEarned: board.reduce((sum, mission) => sum + mission.creditsEarned, 0),
  });
}

export type SubmitOutcome =
  | { kind: "answered"; status: CompletionStatus; xpEarned: number; creditsEarned: number; attemptsLeft: number | null }
  /** The mission was already completed or failed: nothing changed. */
  | { kind: "closed"; status: CompletionStatus; xpEarned: number; creditsEarned: number };

async function pay(deps: Pick<SubmitProofDeps, "xp">, completion: MissionCompletion): Promise<Result<void, MissionError>> {
  if (completion.status !== "completed" || completion.xpEarned + completion.creditsEarned === 0) return ok(undefined);
  const granted = await deps.xp.grant({
    uid: completion.uid,
    source: `mission:${completion.missionId}`,
    xp: completion.xpEarned,
    credits: completion.creditsEarned,
  });
  if (granted.ok) return ok(undefined);
  if (granted.error.code === "not-registered") return err(missionError("not-registered"));
  logServerError("missions.xp.grant", new Error(`${granted.error.code} for ${completion.missionId}`));
  return err(missionError("unknown"));
}

/**
 * Hands in a proof for a mission: a quiz option, a keyword or (from a verified scan) a checkpoint.
 * The completion is decided and stored in one transaction, then its XP and G-Credits are granted through the ledger.
 * Both steps are idempotent, so if the grant fails the completion stays and the next try pays it
 * (a closed mission re-asks the ledger, which pays a source once).
 */
export async function submitMissionProof(
  deps: SubmitProofDeps,
  uid: string,
  missionId: string,
  proof: MissionProof,
): Promise<Result<SubmitOutcome, MissionError>> {
  // Typed answers are limited; scans already went through the check-in limiter.
  if (proof.kind !== "checkpoint" && proof.kind !== "speaker" && !(await deps.limiter.consume(uid))) return err(missionError("rate-limited"));

  const missions = await offeredMissions(deps);
  if (!missions.ok) return missions;
  const mission = missions.value.find((candidate) => candidate.id === missionId);
  if (!mission) return err(missionError("not-found"));
  if (!mission.active) return err(missionError("inactive"));

  const credits = await creditsOf(deps, mission);
  const applied = await deps.completions.apply(uid, mission.id, (previous) => evaluate(mission, proof, previous, credits));
  if (!applied.ok) return err(missionError("unknown"));
  const { before, evaluation, after } = applied.value;

  if (evaluation.kind === "wrong-proof") return err(missionError("wrong-proof"));
  if (evaluation.kind === "closed") {
    const healed = await pay(deps, before!);
    if (!healed.ok) return healed;
    return ok({ kind: "closed", status: before!.status, xpEarned: before!.xpEarned, creditsEarned: before!.creditsEarned });
  }

  const paid = await pay(deps, after!);
  if (!paid.ok) return paid;
  return ok({ kind: "answered", status: after!.status, xpEarned: after!.xpEarned, creditsEarned: after!.creditsEarned, attemptsLeft: attemptsLeft(mission, after) });
}

/** A mission a scan completed (or had completed before), for the scanner to show. */
export interface ScanMission {
  id: string;
  title: string;
  xpEarned: number;
  creditsEarned: number;
  /** False when the mission was already completed: nothing new was earned. */
  justCompleted: boolean;
}

/**
 * After a verified check-in: completes every active talk or stand mission tied to that checkpoint.
 * Called only with checkpoints that passed the check-in rules (a talk only with its code on screen).
 * A failure on one mission never hides the others, and never undoes the check-in; scanning again
 * retries it (both steps are idempotent).
 */
export async function completeByCheckpoint(
  deps: SubmitProofDeps,
  uid: string,
  checkpointId: string,
): Promise<Result<readonly ScanMission[], MissionError>> {
  const missions = await offeredMissions(deps);
  if (!missions.ok) return missions;

  // Only talk and stand missions carry a checkpoint; typed missions are never completed by a scan.
  const tied = missions.value.filter((mission) => mission.active && "checkpointId" in mission.config && mission.config.checkpointId === checkpointId);
  return completeTied(deps, uid, tied, { kind: "checkpoint", checkpointId });
}

/**
 * After a verified scan of a speaker's code: completes every active «Conoce al speaker» mission for that speaker. Like
 * `completeByCheckpoint`, a failure on one mission never hides the others, and scanning again retries it.
 */
export async function completeBySpeaker(deps: SubmitProofDeps, uid: string, speakerId: string): Promise<Result<readonly ScanMission[], MissionError>> {
  const missions = await offeredMissions(deps);
  if (!missions.ok) return missions;
  const tied = missions.value.filter((mission) => mission.active && mission.config.type === "speaker" && mission.config.speakerId === speakerId);
  return completeTied(deps, uid, tied, { kind: "speaker", speakerId });
}

/** Hands the same scan proof to each mission it is tied to, in board order, and answers the completed ones. */
async function completeTied(
  deps: SubmitProofDeps,
  uid: string,
  tied: readonly Mission[],
  proof: Extract<MissionProof, { kind: "checkpoint" | "speaker" }>,
): Promise<Result<readonly ScanMission[], MissionError>> {
  const completed: ScanMission[] = [];
  for (const mission of [...tied].sort(byOrder)) {
    const outcome = await submitMissionProof(deps, uid, mission.id, proof);
    if (!outcome.ok) {
      if (outcome.error.code === "not-registered") return outcome;
      logServerError("missions.scan", new Error(`${outcome.error.code} for ${mission.id}`));
      continue;
    }
    if (outcome.value.status === "completed") {
      completed.push({
        id: mission.id,
        title: mission.title,
        xpEarned: outcome.value.xpEarned,
        creditsEarned: outcome.value.creditsEarned,
        justCompleted: outcome.value.kind === "answered",
      });
    }
  }
  return ok(completed);
}
