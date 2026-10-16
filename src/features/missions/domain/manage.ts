import { chooseImage, dropReplacedImage, type RecordImages } from "@/features/media/constants";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { checkMission, isMinigameDifficulty, isMissionId, type Mission, type MissionDataErrorCode } from "./mission";

export type MissionAdminErrorCode =
  | MissionDataErrorCode
  /** The quadrant is not an active quadrant of the edition. */
  | "unknown-quadrant"
  /** The picture is not an upload made for a mission. */
  | "invalid-image"
  /** A talk or stand mission points to a checkpoint that does not exist or is of another kind. */
  | "unknown-checkpoint"
  /** A speaker mission points to someone who is not an active speaker of the edition. */
  | "unknown-speaker"
  /** The mini-game is not one of the games built in code. */
  | "unknown-minigame"
  /** The mini-game difficulty is not easy, normal or hard. */
  | "invalid-minigame-difficulty"
  /** A mission's type never changes: its completions were judged by its type. */
  | "type-change"
  | "already-exists"
  | "already-seeded"
  | "not-found"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface MissionAdminError {
  code: MissionAdminErrorCode;
}

export const missionAdminError = (code: MissionAdminErrorCode): MissionAdminError => ({ code });

/** What the admin edits. The id is chosen on creation and never changes (completions and the ledger use it). */
export interface MissionDraft {
  title: string;
  description: string;
  quadrantId: string;
  xp: number;
  /** G-Credits it gives; `null` (or left out) uses the edition's default for its type. */
  credits?: number | null;
  /** The mini-game offered once the mission is done; `null` (or left out) for none. */
  minigame?: string | null;
  /** Its difficulty for this mission; `null` (or left out) uses the edition's. */
  minigameDifficulty?: string | null;
  config: unknown;
  /** The picture: left out keeps the current one, null removes it, a path points at an upload. */
  imagePath?: string | null;
}

export type MissionPatch = Partial<Pick<Mission, "title" | "description" | "quadrantId" | "xp" | "credits" | "minigame" | "minigameDifficulty" | "config" | "active" | "image">>;

export interface MissionStore {
  /** Every mission of the active edition (active and inactive), in no particular order. */
  list(): Promise<Result<readonly Mission[], { code: string }>>;
  /** Fails with `already-exists` when the id is taken. */
  create(mission: Mission): Promise<Result<void, { code: "already-exists" | "unknown" }>>;
  /** `null` when the mission does not exist. */
  update(id: string, patch: MissionPatch): Promise<Result<{ before: Mission; after: Mission } | null, { code: string }>>;
  /** Saves the display order: the position of each id in the list. */
  setOrder(ids: readonly string[]): Promise<Result<void, { code: string }>>;
}

/** The edition's active quadrant ids (the quadrants feature answers it). */
export interface QuadrantDirectory {
  activeIds(): Promise<Result<ReadonlySet<string>, { code: string }>>;
}

/** The kind of a checkpoint, or `null` when it does not exist (the check-ins catalog answers it). */
export interface CheckpointDirectory {
  kindOf(id: string): Promise<Result<string | null, { code: string }>>;
}

/** The edition's active speaker ids (the speakers catalog answers it). */
export interface SpeakerDirectory {
  activeIds(): Promise<Result<ReadonlySet<string>, { code: string }>>;
}

/** The mini-games built in code (the mini-games catalog answers it). Whether a game is enabled is checked when it is played. */
export interface MinigameDirectory {
  ids: readonly string[];
}

export interface MissionAuditEntry {
  action: "missions.seeded" | "mission.created" | "mission.updated" | "mission.activated" | "mission.deactivated" | "mission.reordered";
  actorUid: string;
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

export interface MissionAudit {
  append(entry: MissionAuditEntry): Promise<Result<void, { code: string }>>;
}

export interface MissionAdminDeps {
  store: MissionStore;
  quadrants: QuadrantDirectory;
  checkpoints: CheckpointDirectory;
  speakers: SpeakerDirectory;
  minigames: MinigameDirectory;
  images: RecordImages;
  audit: MissionAudit;
  now: () => Date;
}

/** Who is asking. The server action takes it from the verified session, never from the request. */
export interface MissionAdminActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

const forbidden = (actor: MissionAdminActor) => actor.role !== "admin";
const byOrder = (a: Mission, b: Mission) => a.order - b.order || a.title.localeCompare(b.title);

async function audit(deps: Pick<MissionAdminDeps, "audit" | "now">, entry: Omit<MissionAuditEntry, "at">): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  // A change that already happened is not undone by a missing audit line, but it must not go unnoticed.
  if (!written.ok) logServerError("missions.audit.append", new Error(`audit entry missing for ${entry.targetUid}`));
}

/**
 * Checks a draft as a mission and against the edition: its quadrant exists, its checkpoint is of its kind, and its
 * mini-game (if any) is a known game with a known difficulty.
 */
async function checkDraft(deps: MissionAdminDeps, id: string, draft: MissionDraft): Promise<Result<Mission, MissionAdminError>> {
  const checked = checkMission(id, { ...draft, active: true });
  if (!checked.ok) return err(missionAdminError(checked.code));
  const mission = checked.value;

  const quadrants = await deps.quadrants.activeIds();
  if (!quadrants.ok) return err(missionAdminError("unknown"));
  if (!quadrants.value.has(mission.quadrantId)) return err(missionAdminError("unknown-quadrant"));

  if (mission.config.type === "talk" || mission.config.type === "stand") {
    const kind = await deps.checkpoints.kindOf(mission.config.checkpointId);
    if (!kind.ok) return err(missionAdminError("unknown"));
    if (kind.value !== mission.config.type) return err(missionAdminError("unknown-checkpoint"));
  }
  if (mission.config.type === "speaker") {
    const speakers = await deps.speakers.activeIds();
    if (!speakers.ok) return err(missionAdminError("unknown"));
    if (!speakers.value.has(mission.config.speakerId)) return err(missionAdminError("unknown-speaker"));
  }

  // Stored data drops a bad game quietly; what the admin sends is refused instead, so nothing is lost unseen.
  const minigame = draft.minigame ?? null;
  if (minigame !== null && !deps.minigames.ids.includes(minigame)) return err(missionAdminError("unknown-minigame"));
  const difficulty = draft.minigameDifficulty ?? null;
  if (difficulty !== null && !isMinigameDifficulty(difficulty)) return err(missionAdminError("invalid-minigame-difficulty"));
  return ok(mission);
}

/** Every mission of the edition, in the order attendees see them. Empty until missions are seeded or created. */
export async function listManagedMissions(
  deps: Pick<MissionAdminDeps, "store">,
  actor: MissionAdminActor,
): Promise<Result<readonly Mission[], MissionAdminError>> {
  if (forbidden(actor)) return err(missionAdminError("forbidden"));
  const listed = await deps.store.list();
  return listed.ok ? ok([...listed.value].sort(byOrder)) : err(missionAdminError("unknown"));
}

/**
 * Saves the bundled missions as the edition's own, only into an empty edition, keeping their ids so
 * anything attendees already completed while the bundled set was served still counts.
 */
export async function seedMissions(
  deps: MissionAdminDeps,
  actor: MissionAdminActor,
  seed: readonly Mission[],
): Promise<Result<readonly Mission[], MissionAdminError>> {
  if (forbidden(actor)) return err(missionAdminError("forbidden"));

  const listed = await deps.store.list();
  if (!listed.ok) return err(missionAdminError("unknown"));
  if (listed.value.length > 0) return err(missionAdminError("already-seeded"));

  const created: Mission[] = [];
  for (const mission of seed) {
    const saved = await deps.store.create(mission);
    // Another admin seeding at the same time: their missions stand, ours are not doubled.
    if (!saved.ok && saved.error.code !== "already-exists") return err(missionAdminError("unknown"));
    if (saved.ok) created.push(mission);
  }

  await audit(deps, { action: "missions.seeded", actorUid: actor.uid, targetUid: "missions", details: { ids: created.map((m) => m.id).join(",") } });
  return ok(created);
}

/** Creates an active mission at the end of the list. */
export async function createMission(
  deps: MissionAdminDeps,
  actor: MissionAdminActor,
  input: { id: string; draft: MissionDraft },
): Promise<Result<Mission, MissionAdminError>> {
  if (forbidden(actor)) return err(missionAdminError("forbidden"));

  const checked = await checkDraft(deps, input.id, input.draft);
  if (!checked.ok) return checked;
  const image = chooseImage(deps.images, "mission", input.draft.imagePath);
  if (!image) return err(missionAdminError("invalid-image"));

  const listed = await deps.store.list();
  if (!listed.ok) return err(missionAdminError("unknown"));
  // Missions without an order sort last anyway; the new one goes after every ordered one.
  const ordered = listed.value.map((mission) => mission.order).filter((order) => order < Number.MAX_SAFE_INTEGER);
  const order = Math.max(-1, ...ordered) + 1;

  const mission: Mission = { ...checked.value, order, active: true, image: image.keep ? null : image.image };
  const saved = await deps.store.create(mission);
  if (!saved.ok) return err(missionAdminError(saved.error.code === "already-exists" ? "already-exists" : "unknown"));

  await audit(deps, { action: "mission.created", actorUid: actor.uid, targetUid: mission.id, details: { title: mission.title, type: mission.config.type, minigame: mission.minigame } });
  return ok(mission);
}

/** Changes a mission's texts, quadrant, XP and type settings. Its id and type never change. */
export async function updateMission(
  deps: MissionAdminDeps,
  actor: MissionAdminActor,
  input: { id: string; draft: MissionDraft },
): Promise<Result<Mission, MissionAdminError>> {
  if (forbidden(actor)) return err(missionAdminError("forbidden"));
  if (!isMissionId(input.id)) return err(missionAdminError("not-found"));

  const checked = await checkDraft(deps, input.id, input.draft);
  if (!checked.ok) return checked;
  const next = checked.value;
  const image = chooseImage(deps.images, "mission", input.draft.imagePath);
  if (!image) return err(missionAdminError("invalid-image"));

  const listed = await deps.store.list();
  if (!listed.ok) return err(missionAdminError("unknown"));
  const current = listed.value.find((mission) => mission.id === input.id);
  if (!current) return err(missionAdminError("not-found"));
  if (current.config.type !== next.config.type) return err(missionAdminError("type-change"));

  const updated = await deps.store.update(input.id, {
    title: next.title,
    description: next.description,
    quadrantId: next.quadrantId,
    xp: next.xp,
    credits: next.credits,
    minigame: next.minigame,
    minigameDifficulty: next.minigameDifficulty,
    config: next.config,
    ...(image.keep ? {} : { image: image.image }),
  });
  if (!updated.ok) return err(missionAdminError("unknown"));
  if (updated.value === null) return err(missionAdminError("not-found"));

  const { before, after } = updated.value;
  await dropReplacedImage(deps.images, before.image ?? null, after.image ?? null);
  const changed: string[] = [
    ...((before.image?.path ?? null) !== (after.image?.path ?? null) ? ["image"] : []),
    ...(["title", "description", "quadrantId", "xp", "credits", "minigame", "minigameDifficulty"] as const).filter((field) => before[field] !== after[field]),
    ...(JSON.stringify(before.config) !== JSON.stringify(after.config) ? ["config"] : []),
  ];
  if (changed.length > 0) {
    await audit(deps, { action: "mission.updated", actorUid: actor.uid, targetUid: input.id, details: { changed: changed.join(",") } });
  }
  return ok(after);
}

/**
 * Shows or hides a mission for attendees. Allowed at any time: nothing is deleted, and the XP already
 * earned with it stays (the ledger keeps it).
 */
export async function setMissionActive(
  deps: MissionAdminDeps,
  actor: MissionAdminActor,
  input: { id: string; active: boolean },
): Promise<Result<Mission, MissionAdminError>> {
  if (forbidden(actor)) return err(missionAdminError("forbidden"));
  if (!isMissionId(input.id)) return err(missionAdminError("not-found"));

  const updated = await deps.store.update(input.id, { active: input.active });
  if (!updated.ok) return err(missionAdminError("unknown"));
  if (updated.value === null) return err(missionAdminError("not-found"));

  if (updated.value.before.active !== input.active) {
    await audit(deps, {
      action: input.active ? "mission.activated" : "mission.deactivated",
      actorUid: actor.uid,
      targetUid: input.id,
      details: { title: updated.value.after.title },
    });
  }
  return ok(updated.value.after);
}

/** Moves a mission to a place in the list attendees see (clamped to its ends); its own place is a no-op. */
export async function moveMission(
  deps: MissionAdminDeps,
  actor: MissionAdminActor,
  input: { id: string; to: number },
): Promise<Result<readonly string[], MissionAdminError>> {
  if (forbidden(actor)) return err(missionAdminError("forbidden"));

  const listed = await deps.store.list();
  if (!listed.ok) return err(missionAdminError("unknown"));

  const ids = [...listed.value].sort(byOrder).map((mission) => mission.id);
  const from = ids.indexOf(input.id);
  if (from < 0) return err(missionAdminError("not-found"));
  const to = Math.min(Math.max(input.to, 0), ids.length - 1);
  if (to === from) return ok(ids);

  ids.splice(to, 0, ...ids.splice(from, 1));
  const saved = await deps.store.setOrder(ids);
  if (!saved.ok) return err(missionAdminError("unknown"));

  await audit(deps, { action: "mission.reordered", actorUid: actor.uid, targetUid: input.id, details: { order: ids.join(",") } });
  return ok(ids);
}
