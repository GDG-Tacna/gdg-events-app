import { describe, expect, it, vi } from "vitest";
import { ok } from "@/shared/lib/result";
import { DEFAULT_GLOBAL_BADGES } from "../data/default-global-badges";
import {
  createGlobalBadge,
  deleteGlobalBadge,
  listManagedGlobalBadges,
  seedGlobalBadges,
  type GlobalAchievementAdminDeps,
  type GlobalBadgeStore,
} from "./manage-global";
import type { GlobalBadge } from "./global-badge";

vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

function memoryStore(initial: GlobalBadge[] = []): GlobalBadgeStore {
  const items = new Map(initial.map((b) => [b.id, b]));
  return {
    list: async () => ok([...items.values()]),
    create: async (badge) => {
      if (items.has(badge.id)) return { ok: false, error: { code: "already-exists" } };
      items.set(badge.id, badge);
      return ok(undefined);
    },
    update: async (id, patch) => {
      const before = items.get(id);
      if (!before) return ok(null);
      const after = { ...before, ...patch };
      items.set(id, after);
      return ok({ before, after });
    },
    setOrder: async (ids) => {
      ids.forEach((id, order) => {
        const item = items.get(id);
        if (item) items.set(id, { ...item, order });
      });
      return ok(undefined);
    },
    delete: async (id) => {
      const badge = items.get(id);
      if (!badge) return ok({ kind: "not-found" });
      items.delete(id);
      return ok({ kind: "deleted", badge });
    },
  };
}

function makeDeps(initial: GlobalBadge[] = []): GlobalAchievementAdminDeps {
  return {
    store: memoryStore(initial),
    images: {
      ref: (path) => ({ path, url: `/media/${path}` }),
      remove: vi.fn(async () => undefined),
    },
    audit: { append: vi.fn(async () => ok(undefined)) },
    now: () => new Date("2026-11-27T15:00:00Z"),
  };
}

describe("manage-global achievements", () => {
  it("forbids non-global admins (edition organizers and staff)", async () => {
    const deps = makeDeps();
    expect(await listManagedGlobalBadges(deps, { uid: "o1", role: "admin", adminScope: "edition" })).toEqual({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(await seedGlobalBadges(deps, { uid: "s1", role: "staff" }, DEFAULT_GLOBAL_BADGES)).toEqual({
      ok: false,
      error: { code: "forbidden" },
    });
  });

  it("seeds defaults, creates and deletes badges for global admins while preventing deletion of last badge", async () => {
    const deps = makeDeps();
    const globalAdmin = { uid: "a1", role: "admin" as const, adminScope: "global" as const };

    const seeded = await seedGlobalBadges(deps, globalAdmin, DEFAULT_GLOBAL_BADGES.slice(0, 1));
    expect(seeded.ok).toBe(true);
    expect(await deleteGlobalBadge(deps, globalAdmin, { id: "primer-evento" })).toEqual({
      ok: false,
      error: { code: "last-badge" },
    });

    const created = await createGlobalBadge(deps, globalAdmin, {
      id: "super-red",
      draft: {
        name: "Súper Red",
        description: "Conecta con 20 personas entre eventos.",
        tone: "violet",
        rule: { type: "total-contacts", count: 20 },
      },
    });
    expect(created.ok).toBe(true);
    expect(await deleteGlobalBadge(deps, globalAdmin, { id: "super-red" })).toEqual({ ok: true, value: undefined });
  });
});
