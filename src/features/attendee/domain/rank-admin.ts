import type { ImageRef, RecordImages } from "@/features/media/constants";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { parseRankLadder, type RankLadder } from "./rank";

/** Where the edition's ladder is kept. `null` while the edition has none (or it cannot be used). */
export interface RankStore {
  load(): Promise<Result<RankLadder | null, { code: string }>>;
  save(ranks: ReadonlyArray<{ id: string; name: string; minXp: number; iconPath: string | null }>): Promise<Result<void, { code: string }>>;
}

export type RankAdminErrorCode = "invalid-ranks" | "invalid-image" | "edition-locked" | "rank-in-use" | "unauthenticated" | "forbidden" | "disabled" | "unknown";

export interface RankAdminError {
  code: RankAdminErrorCode;
}

const rankAdminError = (code: RankAdminErrorCode): RankAdminError => ({ code });

export interface RankAuditEntry {
  action: "ranks.updated";
  actorUid: string;
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

export interface RankAudit {
  append(entry: RankAuditEntry): Promise<Result<void, { code: string }>>;
}

export interface RankDeps {
  store: RankStore;
  /** The bundled ladder, with its names, used until the edition saves its own. */
  defaults: RankLadder;
}

/** The highest level a food gate asks for (0 when none does): removing ranks must leave it reachable. */
export interface RankGates {
  highestLevelRequired(): Promise<Result<number, { code: string }>>;
}

export interface RankAdminDeps extends RankDeps {
  gates?: RankGates;
  images: RecordImages;
  audit: RankAudit;
  now: () => Date;
}

export interface RankAdminActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

/**
 * The ladder that prices everyone in this edition: the admin's own, or the bundled one. Never fails: a read
 * that fails is logged and the bundled ladder is used, so the dashboard always shows a rank.
 */
export async function getEditionLadder(deps: RankDeps): Promise<RankLadder> {
  const loaded = await deps.store.load();
  if (!loaded.ok) {
    logServerError("ranks.load", new Error(loaded.error.code));
    return deps.defaults;
  }
  return loaded.value ?? deps.defaults;
}

export interface RanksForEdit {
  ranks: Array<{ id: string; name: string; minXp: number; icon: ImageRef | null }>;
  /** True while the edition has no ladder of its own. */
  isDefault: boolean;
}

export async function getRanksForEdit(deps: RankDeps, actor: RankAdminActor): Promise<Result<RanksForEdit, RankAdminError>> {
  if (actor.role !== "admin") return err(rankAdminError("forbidden"));
  const loaded = await deps.store.load();
  if (!loaded.ok) return err(rankAdminError("unknown"));
  const ladder = loaded.value ?? deps.defaults;
  return ok({ ranks: ladder.map((rank) => ({ id: rank.id, name: rank.name ?? rank.id, minXp: rank.minXp, icon: rank.icon ?? null })), isDefault: loaded.value === null });
}

/**
 * Saves the edition's ladder. Ranks are derived from XP and never stored on profiles, so every attendee is
 * repriced at once, with nothing to migrate.
 *
 * Taking a rank out of the ladder is deleting it: `mayRemove: false` (the caller knows the edition is published and the
 * actor is not an admin of every edition) refuses that, though renaming and repricing stay allowed. Removing is also
 * refused while a meal asks for a level the shorter ladder would not have.
 */
export async function saveRanks(deps: RankAdminDeps, actor: RankAdminActor, input: unknown, options: { mayRemove?: boolean } = {}): Promise<Result<RankLadder, RankAdminError>> {
  if (actor.role !== "admin") return err(rankAdminError("forbidden"));
  const parsed = parseRankLadder(input);
  if (!parsed) return err(rankAdminError("invalid-ranks"));

  // The whole ladder is saved at once: each rank sends the icon it keeps (its path) or null for none.
  const sent = input as ReadonlyArray<{ iconPath?: unknown }>;
  const icons: Array<ImageRef | null> = [];
  for (const [index] of parsed.entries()) {
    const path = sent[index]?.iconPath;
    if (path === undefined || path === null) icons.push(null);
    else {
      const icon = typeof path === "string" ? deps.images.ref(path, "rank") : null;
      if (!icon) return err(rankAdminError("invalid-image"));
      icons.push(icon);
    }
  }
  const ladder: RankLadder = parsed.map((rank, index) => ({ ...rank, ...(icons[index] ? { icon: icons[index] } : {}) }));

  const before = await deps.store.load();
  if (!before.ok) return err(rankAdminError("unknown"));
  const removed = (before.value ?? deps.defaults).filter((rank) => !ladder.some((kept) => kept.id === rank.id));
  if (removed.length > 0) {
    if (options.mayRemove === false) return err(rankAdminError("edition-locked"));
    if (deps.gates) {
      const highest = await deps.gates.highestLevelRequired();
      if (!highest.ok) return err(rankAdminError("unknown"));
      if (ladder.length < highest.value) return err(rankAdminError("rank-in-use"));
    }
  }
  const saved = await deps.store.save(ladder.map((rank, index) => ({ id: rank.id, name: rank.name ?? rank.id, minXp: rank.minXp, iconPath: icons[index]?.path ?? null })));
  if (!saved.ok) return err(rankAdminError("unknown"));

  // Icons no rank uses any more are deleted (a failed read just leaves them in place).
  const kept = new Set(icons.flatMap((icon) => (icon ? [icon.path] : [])));
  if (before.value) {
    for (const rank of before.value) if (rank.icon && !kept.has(rank.icon.path)) await deps.images.remove(rank.icon.path);
  }

  const written = await deps.audit.append({
    action: "ranks.updated",
    actorUid: actor.uid,
    targetUid: "ranks",
    details: { ladder: ladder.map((rank) => `${rank.name}:${rank.minXp}`).join(",") },
    at: deps.now(),
  });
  if (!written.ok) logServerError("ranks.audit.append", new Error("audit entry missing for ranks"));
  return ok(ladder);
}
