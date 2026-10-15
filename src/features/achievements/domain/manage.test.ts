import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import type { Badge } from "./badge";
import {
  createBadge,
  listManagedBadges,
  moveBadge,
  seedBadges,
  setBadgeActive,
  updateBadge,
  type AchievementAdminActor,
  type AchievementAdminDeps,
  type BadgeDraft,
} from "./manage";

const NOW = new Date("2026-10-20T13:00:00Z");
const ADMIN: AchievementAdminActor = { uid: "a1", role: "admin" };
const STAFF: AchievementAdminActor = { uid: "s1", role: "staff" };

const badge = (id: string, order: number, overrides: Partial<Badge> = {}): Badge => ({
  id,
  name: `Insignia ${id}`,
  description: "Completa algo.",
  tone: "cyan",
  rule: { type: "missions-completed", count: 1 },
  order,
  active: true,
  image: null,
  ...overrides,
});
const A = badge("alpha", 0);
const B = badge("beta", 1);
const C = badge("gamma", Number.MAX_SAFE_INTEGER);

const DRAFT: BadgeDraft = { name: "Maestro de la IA", description: "Completa el cuadrante de IA.", tone: "gold", rule: { type: "quadrant-complete", quadrantId: "ai" } };

interface Setup {
  list?: Result<readonly Badge[], { code: string }>;
  create?: (badge: Badge) => Result<void, { code: "already-exists" | "unknown" }>;
  update?: Result<{ before: Badge; after: Badge } | null, { code: string }>;
  setOrder?: Result<void, { code: string }>;
  quadrants?: Result<ReadonlySet<string>, { code: string }>;
  missions?: Result<ReadonlySet<string>, { code: string }>;
}

function setup({
  list = ok([B, A]),
  create = () => ok(undefined),
  update = ok({ before: A, after: A }),
  setOrder = ok(undefined),
  quadrants = ok(new Set(["ai", "cloud"])),
  missions = ok(new Set(["ai-quiz"])),
}: Setup = {}) {
  const deps: AchievementAdminDeps = {
    store: { list: vi.fn(async () => list), create: vi.fn(async (value) => create(value)), update: vi.fn(async () => update), setOrder: vi.fn(async () => setOrder) },
    directory: { quadrantIds: vi.fn(async () => quadrants), missionIds: vi.fn(async () => missions) },
    images: { ref: vi.fn((path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null)), remove: vi.fn(async () => {}) },
    audit: { append: vi.fn(async () => ok(undefined)) },
    now: () => NOW,
  };
  return deps;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("listManagedBadges", () => {
  it("lists every badge in order to an admin only", async () => {
    expect(await listManagedBadges(setup(), ADMIN)).toEqual(ok([A, B]));
    expect(await listManagedBadges(setup(), STAFF)).toEqual(err({ code: "forbidden" }));
    expect(await listManagedBadges(setup({ list: err({ code: "unknown" }) }), ADMIN)).toEqual(err({ code: "unknown" }));
  });
});

describe("seedBadges", () => {
  it("loads the bundled badges into an empty edition, keeping their ids, and audits it", async () => {
    const deps = setup({ list: ok([]) });

    expect(await seedBadges(deps, ADMIN, [A, B])).toEqual(ok([A, B]));
    expect(deps.store.create).toHaveBeenCalledTimes(2);
    expect(deps.audit.append).toHaveBeenCalledWith({ action: "badges.seeded", actorUid: "a1", targetUid: "achievements", details: { ids: "alpha,beta" }, at: NOW });
  });

  it("skips one already there, refuses a non-empty edition, and stops on a failed write", async () => {
    expect(await seedBadges(setup({ list: ok([]), create: (value) => (value.id === "alpha" ? err({ code: "already-exists" }) : ok(undefined)) }), ADMIN, [A, B])).toEqual(ok([B]));
    expect(await seedBadges(setup(), ADMIN, [A])).toEqual(err({ code: "already-seeded" }));
    expect(await seedBadges(setup({ list: ok([]), create: () => err({ code: "unknown" }) }), ADMIN, [A])).toEqual(err({ code: "unknown" }));
    expect(await seedBadges(setup({ list: err({ code: "unknown" }) }), ADMIN, [A])).toEqual(err({ code: "unknown" }));
    expect(await seedBadges(setup({ list: ok([]) }), STAFF, [A])).toEqual(err({ code: "forbidden" }));
  });
});

describe("createBadge", () => {
  it("creates an active badge at the end, ignoring badges without an order, and audits it", async () => {
    const deps = setup({ list: ok([A, B, C]) });

    const created = await createBadge(deps, ADMIN, { id: "maestro-ia", draft: DRAFT });

    expect(created).toEqual(ok({ id: "maestro-ia", ...DRAFT, order: 2, active: true, image: null }));
    expect(deps.store.create).toHaveBeenCalledWith({ id: "maestro-ia", ...DRAFT, order: 2, active: true, image: null });
    expect(deps.audit.append).toHaveBeenCalledWith({ action: "badge.created", actorUid: "a1", targetUid: "maestro-ia", details: { name: "Maestro de la IA", rule: "quadrant-complete" }, at: NOW });
  });

  it("starts at 0 in an edition with no badges", async () => {
    expect(await createBadge(setup({ list: ok([]) }), ADMIN, { id: "maestro-ia", draft: DRAFT })).toMatchObject({ ok: true, value: { order: 0 } });
  });

  it("checks that the quadrant or the mission its rule names exists in the edition", async () => {
    expect(await createBadge(setup(), ADMIN, { id: "x-badge", draft: { ...DRAFT, rule: { type: "quadrant-complete", quadrantId: "mars" } } })).toEqual(err({ code: "unknown-quadrant" }));
    expect(await createBadge(setup(), ADMIN, { id: "x-badge", draft: { ...DRAFT, rule: { type: "mission-completed", missionId: "nope" } } })).toEqual(err({ code: "unknown-mission" }));
    expect(await createBadge(setup(), ADMIN, { id: "x-badge", draft: { ...DRAFT, rule: { type: "mission-completed", missionId: "ai-quiz" } } })).toMatchObject({ ok: true });
    expect(await createBadge(setup({ quadrants: err({ code: "unknown" }) }), ADMIN, { id: "x-badge", draft: DRAFT })).toEqual(err({ code: "unknown" }));
    expect(await createBadge(setup({ missions: err({ code: "unknown" }) }), ADMIN, { id: "x-badge", draft: { ...DRAFT, rule: { type: "mission-completed", missionId: "ai-quiz" } } })).toEqual(err({ code: "unknown" }));
  });

  it("does not look anything up for count and level rules", async () => {
    const deps = setup();

    await createBadge(deps, ADMIN, { id: "x-badge", draft: { ...DRAFT, rule: { type: "level-reached", level: 3 } } });

    expect(deps.directory.quadrantIds).not.toHaveBeenCalled();
    expect(deps.directory.missionIds).not.toHaveBeenCalled();
  });

  it("refuses non-admins, invalid fields and a taken id", async () => {
    expect(await createBadge(setup(), STAFF, { id: "x-badge", draft: DRAFT })).toEqual(err({ code: "forbidden" }));
    expect(await createBadge(setup(), ADMIN, { id: "X", draft: DRAFT })).toEqual(err({ code: "invalid-id" }));
    expect(await createBadge(setup(), ADMIN, { id: "x-badge", draft: { ...DRAFT, tone: "red" } })).toEqual(err({ code: "invalid-tone" }));
    expect(await createBadge(setup(), ADMIN, { id: "x-badge", draft: { ...DRAFT, rule: { type: "level-reached", level: 1 } } })).toEqual(err({ code: "invalid-rule" }));
    expect(await createBadge(setup({ create: () => err({ code: "already-exists" }) }), ADMIN, { id: "x-badge", draft: DRAFT })).toEqual(err({ code: "already-exists" }));
    expect(await createBadge(setup({ create: () => err({ code: "unknown" }) }), ADMIN, { id: "x-badge", draft: DRAFT })).toEqual(err({ code: "unknown" }));
    expect(await createBadge(setup({ list: err({ code: "unknown" }) }), ADMIN, { id: "x-badge", draft: DRAFT })).toEqual(err({ code: "unknown" }));
  });
});

describe("updateBadge", () => {
  it("saves the fields, audits what changed (the rule compared by value)", async () => {
    const after = { ...A, name: "Nuevo", rule: { type: "missions-completed" as const, count: 3 } };
    const deps = setup({ update: ok({ before: A, after }) });

    expect(await updateBadge(deps, ADMIN, { id: "alpha", draft: { name: "Nuevo", description: A.description, tone: "cyan", rule: { type: "missions-completed", count: 3 } } })).toEqual(ok(after));
    expect(deps.store.update).toHaveBeenCalledWith("alpha", { name: "Nuevo", description: A.description, tone: "cyan", rule: { type: "missions-completed", count: 3 } });
    expect(deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "badge.updated", details: { changed: "name,rule" } }));
  });

  it("writes no audit line when nothing changed, even with an equal rule object", async () => {
    const deps = setup({ update: ok({ before: A, after: { ...A, rule: { type: "missions-completed", count: 1 } } }) });

    await updateBadge(deps, ADMIN, { id: "alpha", draft: { name: A.name, description: A.description, tone: A.tone, rule: A.rule } });
    expect(deps.audit.append).not.toHaveBeenCalled();
  });

  it("audits a change of tone or description alone", async () => {
    const deps = setup({ update: ok({ before: A, after: { ...A, tone: "gold" } }) });

    await updateBadge(deps, ADMIN, { id: "alpha", draft: { name: A.name, description: A.description, tone: "gold", rule: A.rule } });
    expect(deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ details: { changed: "tone" } }));
  });

  describe("image", () => {
    const OLD = "public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455550000.webp";
    const NEW = "public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455551111.webp";
    const ref = (path: string) => ({ path, url: `https://cdn/${path}` });
    const draft = { name: A.name, description: A.description, tone: A.tone, rule: A.rule };

    it("creates a badge with an uploaded image, the address rebuilt by the server", async () => {
      const deps = setup({ list: ok([]) });

      const created = await createBadge(deps, ADMIN, { id: "maestro-ia", draft: { ...DRAFT, imagePath: NEW } });

      expect(created.ok && created.value.image).toEqual(ref(NEW));
      expect(deps.images.ref).toHaveBeenCalledWith(NEW, "badge");
    });

    it("sets a new image, deletes the one it replaces and audits it", async () => {
      const before = { ...A, image: ref(OLD) };
      const deps = setup({ update: ok({ before, after: { ...before, image: ref(NEW) } }) });

      await updateBadge(deps, ADMIN, { id: "alpha", draft: { ...draft, imagePath: NEW } });

      expect(deps.store.update).toHaveBeenCalledWith("alpha", expect.objectContaining({ image: ref(NEW) }));
      expect(deps.images.remove).toHaveBeenCalledWith(OLD);
      expect(deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ details: { changed: "image" } }));
    });

    it("removes the image on null, and keeps it (touching nothing) when the form sends none", async () => {
      const before = { ...A, image: ref(OLD) };
      const removing = setup({ update: ok({ before, after: { ...before, image: null } }) });
      await updateBadge(removing, ADMIN, { id: "alpha", draft: { ...draft, imagePath: null } });
      expect(removing.store.update).toHaveBeenCalledWith("alpha", expect.objectContaining({ image: null }));
      expect(removing.images.remove).toHaveBeenCalledWith(OLD);

      const keeping = setup({ update: ok({ before, after: before }) });
      await updateBadge(keeping, ADMIN, { id: "alpha", draft });
      expect(keeping.store.update).toHaveBeenCalledWith("alpha", expect.not.objectContaining({ image: expect.anything() }));
      expect(keeping.images.remove).not.toHaveBeenCalled();
    });

    it("refuses another kind's image or a foreign address, saving nothing", async () => {
      const deps = setup();

      expect(await updateBadge(deps, ADMIN, { id: "alpha", draft: { ...draft, imagePath: "public/devfest-2026/raffle-prize/0f8e2c1a-1111-4222-8333-944455551111.webp" } })).toEqual(
        err({ code: "invalid-image" }),
      );
      expect(await createBadge(deps, ADMIN, { id: "maestro-ia", draft: { ...DRAFT, imagePath: "https://evil.example/x.webp" } })).toEqual(err({ code: "invalid-image" }));
      expect(deps.store.update).not.toHaveBeenCalled();
      expect(deps.store.create).not.toHaveBeenCalled();
    });
  });

  it("refuses non-admins, unknown ids and invalid drafts, and reports failures", async () => {
    expect(await updateBadge(setup(), STAFF, { id: "alpha", draft: DRAFT })).toEqual(err({ code: "forbidden" }));
    expect(await updateBadge(setup(), ADMIN, { id: "../x", draft: DRAFT })).toEqual(err({ code: "not-found" }));
    expect(await updateBadge(setup(), ADMIN, { id: "alpha", draft: { ...DRAFT, name: "" } })).toEqual(err({ code: "invalid-name" }));
    expect(await updateBadge(setup({ update: ok(null) }), ADMIN, { id: "alpha", draft: DRAFT })).toEqual(err({ code: "not-found" }));
    expect(await updateBadge(setup({ update: err({ code: "unknown" }) }), ADMIN, { id: "alpha", draft: DRAFT })).toEqual(err({ code: "unknown" }));
  });
});

describe("setBadgeActive", () => {
  it("deactivates and activates, auditing only a real change", async () => {
    const off = setup({ update: ok({ before: A, after: { ...A, active: false } }) });
    expect(await setBadgeActive(off, ADMIN, { id: "alpha", active: false })).toEqual(ok({ ...A, active: false }));
    expect(off.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "badge.deactivated", details: { name: "Insignia alpha" } }));

    const on = setup({ update: ok({ before: { ...A, active: false }, after: A }) });
    await setBadgeActive(on, ADMIN, { id: "alpha", active: true });
    expect(on.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "badge.activated" }));

    const same = setup();
    await setBadgeActive(same, ADMIN, { id: "alpha", active: true });
    expect(same.audit.append).not.toHaveBeenCalled();
  });

  it("refuses non-admins and unknown ids, and reports failures", async () => {
    expect(await setBadgeActive(setup(), STAFF, { id: "alpha", active: false })).toEqual(err({ code: "forbidden" }));
    expect(await setBadgeActive(setup(), ADMIN, { id: "../x", active: false })).toEqual(err({ code: "not-found" }));
    expect(await setBadgeActive(setup({ update: ok(null) }), ADMIN, { id: "alpha", active: false })).toEqual(err({ code: "not-found" }));
    expect(await setBadgeActive(setup({ update: err({ code: "unknown" }) }), ADMIN, { id: "alpha", active: false })).toEqual(err({ code: "unknown" }));
  });
});

describe("moveBadge", () => {
  it("swaps a badge with its neighbour and saves the whole order", async () => {
    const deps = setup({ list: ok([A, B, C]) });

    expect(await moveBadge(deps, ADMIN, { id: "beta", to: 0 })).toEqual(ok(["beta", "alpha", "gamma"]));
    expect(deps.store.setOrder).toHaveBeenCalledWith(["beta", "alpha", "gamma"]);
    expect(deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "badge.reordered", targetUid: "beta" }));
    expect(await moveBadge(setup({ list: ok([A, B, C]) }), ADMIN, { id: "beta", to: 2 })).toEqual(ok(["alpha", "gamma", "beta"]));
  });

  it("leaves the ends where they are without writing", async () => {
    const deps = setup({ list: ok([A, B]) });

    expect(await moveBadge(deps, ADMIN, { id: "alpha", to: 0 })).toEqual(ok(["alpha", "beta"]));
    expect(await moveBadge(deps, ADMIN, { id: "beta", to: 9 })).toEqual(ok(["alpha", "beta"]));
    expect(deps.store.setOrder).not.toHaveBeenCalled();
  });

  it("refuses non-admins and unknown ids, and reports failures", async () => {
    expect(await moveBadge(setup(), STAFF, { id: "alpha", to: 0 })).toEqual(err({ code: "forbidden" }));
    expect(await moveBadge(setup(), ADMIN, { id: "nope", to: 0 })).toEqual(err({ code: "not-found" }));
    expect(await moveBadge(setup({ list: err({ code: "unknown" }) }), ADMIN, { id: "alpha", to: 0 })).toEqual(err({ code: "unknown" }));
    expect(await moveBadge(setup({ setOrder: err({ code: "unknown" }) }), ADMIN, { id: "beta", to: 0 })).toEqual(err({ code: "unknown" }));
  });
});
