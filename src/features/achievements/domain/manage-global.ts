import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { chooseImage, dropReplacedImage, type RecordImages } from "@/features/media/constants";
import { isSlug, type BadgeTone } from "./badge";
import { checkGlobalBadge, type GlobalBadge, type GlobalBadgeRule } from "./global-badge";
import type { AchievementAdminError, AchievementAdminErrorCode, AchievementAuditEntry } from "./manage";

export interface GlobalBadgeDraft {
  name: string;
  description: string;
  tone: BadgeTone | string;
  rule: GlobalBadgeRule | Record<string, unknown>;
  imagePath?: string | null;
}

export type GlobalBadgePatch = Partial<Pick<GlobalBadge, "name" | "description" | "tone" | "rule" | "active" | "image">>;

export type GlobalBadgeDeletion = { kind: "deleted"; badge: GlobalBadge } | { kind: "not-found" } | { kind: "has-awards" };

export interface GlobalBadgeStore {
  list(): Promise<Result<readonly GlobalBadge[], { code: string }>>;
  create(badge: GlobalBadge): Promise<Result<void, { code: "already-exists" | "unknown" }>>;
  update(id: string, patch: GlobalBadgePatch): Promise<Result<{ before: GlobalBadge; after: GlobalBadge } | null, { code: string }>>;
  setOrder(ids: readonly string[]): Promise<Result<void, { code: string }>>;
  delete(id: string): Promise<Result<GlobalBadgeDeletion, { code: string }>>;
}

export interface GlobalAchievementAdminActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
  adminScope?: "global" | "edition";
}

export interface GlobalAchievementAdminDeps {
  store: GlobalBadgeStore;
  images: RecordImages;
  audit: { append(entry: AchievementAuditEntry): Promise<Result<void, { code: string }>> };
  now: () => Date;
}

const adminError = (code: AchievementAdminErrorCode): AchievementAdminError => ({ code });
const forbidden = (actor: GlobalAchievementAdminActor) => actor.role !== "admin" || actor.adminScope !== "global";
const byOrder = (a: GlobalBadge, b: GlobalBadge) => a.order - b.order || a.name.localeCompare(b.name);
const sameRule = (a: GlobalBadgeRule, b: GlobalBadgeRule) => JSON.stringify(a) === JSON.stringify(b);

async function audit(deps: Pick<GlobalAchievementAdminDeps, "audit" | "now">, entry: Omit<AchievementAuditEntry, "at">): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  if (!written.ok) logServerError("achievements.global.audit", new Error(`audit entry missing for ${entry.targetUid}`));
}

export async function listManagedGlobalBadges(
  deps: Pick<GlobalAchievementAdminDeps, "store">,
  actor: GlobalAchievementAdminActor,
): Promise<Result<readonly GlobalBadge[], AchievementAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const listed = await deps.store.list();
  return listed.ok ? ok([...listed.value].sort(byOrder)) : err(adminError("unknown"));
}

export async function seedGlobalBadges(
  deps: GlobalAchievementAdminDeps,
  actor: GlobalAchievementAdminActor,
  seed: readonly GlobalBadge[],
): Promise<Result<readonly GlobalBadge[], AchievementAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const listed = await deps.store.list();
  if (!listed.ok) return err(adminError("unknown"));
  if (listed.value.length > 0) return err(adminError("already-seeded"));

  const created: GlobalBadge[] = [];
  for (const badge of seed) {
    const saved = await deps.store.create(badge);
    if (!saved.ok && saved.error.code !== "already-exists") return err(adminError("unknown"));
    if (saved.ok) created.push(badge);
  }
  await audit(deps, {
    action: "badges.seeded",
    actorUid: actor.uid,
    targetUid: "globalAchievements",
    details: { ids: created.map((badge) => badge.id).join(",") },
  });
  return ok(created);
}

export async function createGlobalBadge(
  deps: GlobalAchievementAdminDeps,
  actor: GlobalAchievementAdminActor,
  input: { id: string; draft: GlobalBadgeDraft },
): Promise<Result<GlobalBadge, AchievementAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const checked = checkGlobalBadge(input.id, { ...input.draft, active: true });
  if (!checked.ok) return err(adminError(checked.code));
  const image = chooseImage(deps.images, "badge", input.draft.imagePath);
  if (!image) return err(adminError("invalid-image"));

  const listed = await deps.store.list();
  if (!listed.ok) return err(adminError("unknown"));
  const order = Math.max(-1, ...listed.value.map((badge) => badge.order).filter((value) => value < Number.MAX_SAFE_INTEGER)) + 1;

  const badge: GlobalBadge = { ...checked.value, order, active: true, image: image.keep ? null : image.image };
  const saved = await deps.store.create(badge);
  if (!saved.ok) return err(adminError(saved.error.code === "already-exists" ? "already-exists" : "unknown"));
  await audit(deps, {
    action: "badge.created",
    actorUid: actor.uid,
    targetUid: `global:${badge.id}`,
    details: { name: badge.name, rule: badge.rule.type },
  });
  return ok(badge);
}

export async function updateGlobalBadge(
  deps: GlobalAchievementAdminDeps,
  actor: GlobalAchievementAdminActor,
  input: { id: string; draft: GlobalBadgeDraft },
): Promise<Result<GlobalBadge, AchievementAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  if (!isSlug(input.id)) return err(adminError("not-found"));
  const checked = checkGlobalBadge(input.id, { ...input.draft, active: true });
  if (!checked.ok) return err(adminError(checked.code));
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
    await audit(deps, {
      action: "badge.updated",
      actorUid: actor.uid,
      targetUid: `global:${input.id}`,
      details: { changed: changed.join(",") },
    });
  }
  return ok(after);
}

export async function setGlobalBadgeActive(
  deps: GlobalAchievementAdminDeps,
  actor: GlobalAchievementAdminActor,
  input: { id: string; active: boolean },
): Promise<Result<GlobalBadge, AchievementAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  if (!isSlug(input.id)) return err(adminError("not-found"));
  const updated = await deps.store.update(input.id, { active: input.active });
  if (!updated.ok) return err(adminError("unknown"));
  if (updated.value === null) return err(adminError("not-found"));
  if (updated.value.before.active !== input.active) {
    await audit(deps, {
      action: input.active ? "badge.activated" : "badge.deactivated",
      actorUid: actor.uid,
      targetUid: `global:${input.id}`,
      details: { name: updated.value.after.name },
    });
  }
  return ok(updated.value.after);
}

export async function deleteGlobalBadge(
  deps: GlobalAchievementAdminDeps,
  actor: GlobalAchievementAdminActor,
  input: { id: string },
): Promise<Result<void, AchievementAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  if (!isSlug(input.id)) return err(adminError("not-found"));

  const listed = await deps.store.list();
  if (!listed.ok) return err(adminError("unknown"));
  if (!listed.value.some((badge) => badge.id === input.id)) return err(adminError("not-found"));
  if (listed.value.length === 1) return err(adminError("last-badge"));

  const deleted = await deps.store.delete(input.id);
  if (!deleted.ok) return err(adminError("unknown"));
  if (deleted.value.kind === "not-found") return err(adminError("not-found"));
  if (deleted.value.kind === "has-awards") return err(adminError("has-awards"));

  const { badge } = deleted.value;
  await dropReplacedImage(deps.images, badge.image ?? null, null);
  await audit(deps, {
    action: "badge.deleted",
    actorUid: actor.uid,
    targetUid: `global:${badge.id}`,
    details: { name: badge.name, rule: badge.rule.type },
  });
  return ok(undefined);
}

export async function moveGlobalBadge(
  deps: GlobalAchievementAdminDeps,
  actor: GlobalAchievementAdminActor,
  input: { id: string; to: number },
): Promise<Result<readonly string[], AchievementAdminError>> {
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
  await audit(deps, {
    action: "badge.reordered",
    actorUid: actor.uid,
    targetUid: `global:${input.id}`,
    details: { order: ids.join(",") },
  });
  return ok(ids);
}
