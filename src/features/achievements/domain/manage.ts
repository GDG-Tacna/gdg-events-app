import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { chooseImage, dropReplacedImage, type RecordImages } from "@/features/media/constants";
import { checkBadge, isSlug, type Badge, type BadgeDataErrorCode, type BadgeRule, type BadgeTone } from "./badge";

export type AchievementAdminErrorCode =
  | BadgeDataErrorCode
  | "unknown-quadrant"
  | "unknown-mission"
  | "already-exists"
  | "already-seeded"
  | "not-found"
  | "invalid-image"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface AchievementAdminError {
  code: AchievementAdminErrorCode;
}

const adminError = (code: AchievementAdminErrorCode): AchievementAdminError => ({ code });

/** What the admin edits. The id is chosen on creation and never changes. */
export interface BadgeDraft {
  name: string;
  description: string;
  tone: BadgeTone | string;
  rule: BadgeRule | Record<string, unknown>;
  /** The image: left out keeps the current one, null removes it, a path points at an upload. */
  imagePath?: string | null;
}

export type BadgePatch = Partial<Pick<Badge, "name" | "description" | "tone" | "rule" | "active" | "image">>;

export interface BadgeStore {
  list(): Promise<Result<readonly Badge[], { code: string }>>;
  create(badge: Badge): Promise<Result<void, { code: "already-exists" | "unknown" }>>;
  update(id: string, patch: BadgePatch): Promise<Result<{ before: Badge; after: Badge } | null, { code: string }>>;
  setOrder(ids: readonly string[]): Promise<Result<void, { code: string }>>;
}

/** The edition's quadrants and missions a rule may point at (the quadrants and missions features answer). */
export interface AchievementDirectory {
  quadrantIds(): Promise<Result<ReadonlySet<string>, { code: string }>>;
  missionIds(): Promise<Result<ReadonlySet<string>, { code: string }>>;
}

export interface AchievementAuditEntry {
  action: "badges.seeded" | "badge.created" | "badge.updated" | "badge.activated" | "badge.deactivated" | "badge.reordered";
  actorUid: string;
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

export interface AchievementAdminDeps {
  store: BadgeStore;
  directory: AchievementDirectory;
  images: RecordImages;
  audit: { append(entry: AchievementAuditEntry): Promise<Result<void, { code: string }>> };
  now: () => Date;
}

export interface AchievementAdminActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

const forbidden = (actor: AchievementAdminActor) => actor.role !== "admin";
const byOrder = (a: Badge, b: Badge) => a.order - b.order || a.name.localeCompare(b.name);
const sameRule = (a: BadgeRule, b: BadgeRule) => JSON.stringify(a) === JSON.stringify(b);

async function audit(deps: Pick<AchievementAdminDeps, "audit" | "now">, entry: Omit<AchievementAuditEntry, "at">): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  if (!written.ok) logServerError("achievements.audit.append", new Error(`audit entry missing for ${entry.targetUid}`));
}

/** Checks a draft and that the quadrant or mission its rule points at exists in the edition. */
async function checkDraft(deps: AchievementAdminDeps, id: string, draft: BadgeDraft): Promise<Result<Badge, AchievementAdminError>> {
  const checked = checkBadge(id, { ...draft, active: true });
  if (!checked.ok) return err(adminError(checked.code));
  const { rule } = checked.value;
  if (rule.type === "quadrant-complete") {
    const quadrants = await deps.directory.quadrantIds();
    if (!quadrants.ok) return err(adminError("unknown"));
    if (!quadrants.value.has(rule.quadrantId)) return err(adminError("unknown-quadrant"));
  }
  if (rule.type === "mission-completed") {
    const missions = await deps.directory.missionIds();
    if (!missions.ok) return err(adminError("unknown"));
    if (!missions.value.has(rule.missionId)) return err(adminError("unknown-mission"));
  }
  return ok(checked.value);
}

export async function listManagedBadges(deps: Pick<AchievementAdminDeps, "store">, actor: AchievementAdminActor): Promise<Result<readonly Badge[], AchievementAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const listed = await deps.store.list();
  return listed.ok ? ok([...listed.value].sort(byOrder)) : err(adminError("unknown"));
}

/** Saves the bundled badges as the edition's own, only into an empty edition, keeping their ids. */
export async function seedBadges(deps: AchievementAdminDeps, actor: AchievementAdminActor, seed: readonly Badge[]): Promise<Result<readonly Badge[], AchievementAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const listed = await deps.store.list();
  if (!listed.ok) return err(adminError("unknown"));
  if (listed.value.length > 0) return err(adminError("already-seeded"));

  const created: Badge[] = [];
  for (const badge of seed) {
    const saved = await deps.store.create(badge);
    if (!saved.ok && saved.error.code !== "already-exists") return err(adminError("unknown"));
    if (saved.ok) created.push(badge);
  }
  await audit(deps, { action: "badges.seeded", actorUid: actor.uid, targetUid: "achievements", details: { ids: created.map((badge) => badge.id).join(",") } });
  return ok(created);
}

export async function createBadge(deps: AchievementAdminDeps, actor: AchievementAdminActor, input: { id: string; draft: BadgeDraft }): Promise<Result<Badge, AchievementAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const checked = await checkDraft(deps, input.id, input.draft);
  if (!checked.ok) return checked;
  const image = chooseImage(deps.images, "badge", input.draft.imagePath);
  if (!image) return err(adminError("invalid-image"));

  const listed = await deps.store.list();
  if (!listed.ok) return err(adminError("unknown"));
  const order = Math.max(-1, ...listed.value.map((badge) => badge.order).filter((value) => value < Number.MAX_SAFE_INTEGER)) + 1;

  const badge: Badge = { ...checked.value, order, active: true, image: image.keep ? null : image.image };
  const saved = await deps.store.create(badge);
  if (!saved.ok) return err(adminError(saved.error.code === "already-exists" ? "already-exists" : "unknown"));
  await audit(deps, { action: "badge.created", actorUid: actor.uid, targetUid: badge.id, details: { name: badge.name, rule: badge.rule.type } });
  return ok(badge);
}

/**
 * Edits a badge. Who already earned it keeps it, even when the rule becomes harder: awards are never
 * taken back.
 */
export async function updateBadge(deps: AchievementAdminDeps, actor: AchievementAdminActor, input: { id: string; draft: BadgeDraft }): Promise<Result<Badge, AchievementAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  if (!isSlug(input.id)) return err(adminError("not-found"));
  const checked = await checkDraft(deps, input.id, input.draft);
  if (!checked.ok) return checked;
  const image = chooseImage(deps.images, "badge", input.draft.imagePath);
  if (!image) return err(adminError("invalid-image"));

  const { name, description, tone, rule } = checked.value;
  const updated = await deps.store.update(input.id, { name, description, tone, rule, ...(image.keep ? {} : { image: image.image }) });
  if (!updated.ok) return err(adminError("unknown"));
  if (updated.value === null) return err(adminError("not-found"));

  const { before, after } = updated.value;
  await dropReplacedImage(deps.images, before.image, after.image);
  const changed = [
    ...(["name", "description", "tone"] as const).filter((field) => before[field] !== after[field]),
    ...(sameRule(before.rule, after.rule) ? [] : ["rule"]),
    ...(before.image?.path === after.image?.path ? [] : ["image"]),
  ];
  if (changed.length > 0) {
    await audit(deps, { action: "badge.updated", actorUid: actor.uid, targetUid: input.id, details: { changed: changed.join(",") } });
  }
  return ok(after);
}

export async function setBadgeActive(deps: AchievementAdminDeps, actor: AchievementAdminActor, input: { id: string; active: boolean }): Promise<Result<Badge, AchievementAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  if (!isSlug(input.id)) return err(adminError("not-found"));
  const updated = await deps.store.update(input.id, { active: input.active });
  if (!updated.ok) return err(adminError("unknown"));
  if (updated.value === null) return err(adminError("not-found"));
  if (updated.value.before.active !== input.active) {
    await audit(deps, {
      action: input.active ? "badge.activated" : "badge.deactivated",
      actorUid: actor.uid,
      targetUid: input.id,
      details: { name: updated.value.after.name },
    });
  }
  return ok(updated.value.after);
}

export async function moveBadge(deps: AchievementAdminDeps, actor: AchievementAdminActor, input: { id: string; to: number }): Promise<Result<readonly string[], AchievementAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const listed = await deps.store.list();
  if (!listed.ok) return err(adminError("unknown"));

  const ids = [...listed.value].sort(byOrder).map((badge) => badge.id);
  const from = ids.indexOf(input.id);
  if (from < 0) return err(adminError("not-found"));
  const to = Math.min(Math.max(input.to, 0), ids.length - 1);
  if (to === from) return ok(ids);

  ids.splice(to, 0, ...ids.splice(from, 1));
  const saved = await deps.store.setOrder(ids);
  if (!saved.ok) return err(adminError("unknown"));
  await audit(deps, { action: "badge.reordered", actorUid: actor.uid, targetUid: input.id, details: { order: ids.join(",") } });
  return ok(ids);
}
