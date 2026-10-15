import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import {
  createQuadrant,
  getVenueForEdit,
  listManagedQuadrants,
  moveQuadrant,
  saveVenue,
  seedLayout,
  setQuadrantActive,
  updateQuadrant,
  type QuadrantAdminActor,
  type QuadrantAdminDeps,
  type QuadrantAuditEntry,
  type QuadrantPatch,
} from "./manage";
import type { Quadrant } from "./quadrant";
import type { VenueArea, VenueMap } from "./venue";

const ADMIN: QuadrantAdminActor = { uid: "a1", role: "admin" };
const NOW = new Date("2026-10-20T12:00:00Z");

const quadrant = (id: string, order: number, extra: Partial<Quadrant> = {}): Quadrant => ({ id, name: id.toUpperCase(), tagline: "Lema", planet: "ai", order, active: true, ...extra });
const stand = (id: string, quadrantId: string, x: number): VenueArea => ({ id, kind: "stand", label: `Stand ${id}`, quadrantId, rect: { x, y: 0, width: 10, height: 10 } });
const plan = (areas: VenueArea[]): VenueMap => ({ width: 100, height: 100, areas });

const DEFAULTS = { quadrants: [quadrant("cloud", 0), quadrant("ai", 1)], venue: plan([stand("cloud-1", "cloud", 0), stand("ai-1", "ai", 20)]) };

function setup({ quadrants = [quadrant("bb", 1), quadrant("aa", 0), quadrant("cc", 2)], venue = null as VenueMap | null } = {}) {
  const rows = new Map(quadrants.map((q) => [q.id, q]));
  const saved = { venue };
  const entries: QuadrantAuditEntry[] = [];
  const store = {
    listQuadrants: vi.fn(async (): Promise<Result<readonly Quadrant[], { code: string }>> => ok([...rows.values()])),
    createQuadrant: vi.fn(async (q: Quadrant): Promise<Result<void, { code: "already-exists" | "unknown" }>> => {
      if (rows.has(q.id)) return err({ code: "already-exists" });
      rows.set(q.id, q);
      return ok(undefined);
    }),
    updateQuadrant: vi.fn(async (id: string, patch: QuadrantPatch) => {
      const before = rows.get(id);
      if (!before) return ok(null);
      const after = { ...before, ...patch };
      rows.set(id, after);
      return ok({ before, after });
    }),
    setQuadrantOrder: vi.fn(async (ids: readonly string[]) => {
      ids.forEach((id, order) => rows.set(id, { ...rows.get(id)!, order }));
      return ok(undefined);
    }),
    loadVenue: vi.fn(async (): Promise<Result<VenueMap | null, { code: string }>> => ok(saved.venue)),
    saveVenue: vi.fn(async (next: VenueMap): Promise<Result<void, { code: string }>> => {
      saved.venue = next;
      return ok(undefined);
    }),
  };
  const stands = { ensure: vi.fn(async (_actor: QuadrantAdminActor, list: ReadonlyArray<{ id: string; name: string }>) => ({ created: list.map((s) => s.id), failed: [] as string[] })) };
  const deps = {
    store,
    stands,
    images: { ref: vi.fn((path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null)), remove: vi.fn(async () => {}) },
    audit: { append: vi.fn(async (entry: QuadrantAuditEntry) => (entries.push(entry), ok(undefined))) },
    defaults: DEFAULTS,
    now: () => NOW,
  } satisfies QuadrantAdminDeps;
  return { deps, rows, saved, entries };
}

describe("quadrant and venue admin", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it.each([
    ["staff", { uid: "s1", role: "staff" }],
    ["an attendee", { uid: "u1", role: "attendee" }],
  ] as const)("refuses %s everything", async (_, actor) => {
    const forbidden = err({ code: "forbidden" });
    expect(await listManagedQuadrants(ctx.deps, actor)).toEqual(forbidden);
    expect(await seedLayout(ctx.deps, actor)).toEqual(forbidden);
    expect(await createQuadrant(ctx.deps, actor, { id: "new-one", name: "Nuevo", tagline: "Lema", planet: "ai" })).toEqual(forbidden);
    expect(await updateQuadrant(ctx.deps, actor, { id: "aa", name: "Nuevo", tagline: "Lema", planet: "ai" })).toEqual(forbidden);
    expect(await setQuadrantActive(ctx.deps, actor, { id: "aa", active: false })).toEqual(forbidden);
    expect(await moveQuadrant(ctx.deps, actor, { id: "aa", to: 1 })).toEqual(forbidden);
    expect(await getVenueForEdit(ctx.deps, actor)).toEqual(forbidden);
    expect(await saveVenue(ctx.deps, actor, DEFAULTS.venue)).toEqual(forbidden);
    expect(ctx.deps.store.saveVenue).not.toHaveBeenCalled();
    expect(ctx.deps.stands.ensure).not.toHaveBeenCalled();
  });

  it("lists the quadrants in order", async () => {
    const listed = await listManagedQuadrants(ctx.deps, ADMIN);
    expect(listed.ok && listed.value.map((q) => q.id)).toEqual(["aa", "bb", "cc"]);
  });

  describe("seed", () => {
    it("saves the bundled quadrants and plan into an empty edition and gives each stand its QR", async () => {
      const empty = setup({ quadrants: [] });

      expect(await seedLayout(empty.deps, ADMIN)).toEqual(ok({ quadrants: 2, standQrs: ["stand-cloud-1", "stand-ai-1"] }));
      expect([...empty.rows.keys()]).toEqual(["cloud", "ai"]);
      expect(empty.saved.venue).toEqual(DEFAULTS.venue);
      expect(empty.deps.stands.ensure).toHaveBeenCalledWith(ADMIN, [
        { id: "stand-cloud-1", name: "Stand cloud-1" },
        { id: "stand-ai-1", name: "Stand ai-1" },
      ]);
      expect(empty.entries[0]).toMatchObject({ action: "layout.seeded", details: { quadrants: "2", standQrs: "stand-cloud-1,stand-ai-1" } });
    });

    it("keeps a plan the edition already saved", async () => {
      const own = plan([stand("x-1", "cloud", 50)]);
      const empty = setup({ quadrants: [], venue: own });

      await seedLayout(empty.deps, ADMIN);

      expect(empty.deps.store.saveVenue).not.toHaveBeenCalled();
      expect(empty.deps.stands.ensure).toHaveBeenCalledWith(ADMIN, [{ id: "stand-x-1", name: "Stand x-1" }]);
    });

    it("never seeds over existing quadrants", async () => {
      expect(await seedLayout(ctx.deps, ADMIN)).toEqual(err({ code: "already-seeded" }));
      expect(ctx.deps.store.createQuadrant).not.toHaveBeenCalled();
    });
  });

  describe("quadrants", () => {
    it("creates one at the end, normalized, and audits it", async () => {
      const result = await createQuadrant(ctx.deps, ADMIN, { id: "web", name: "  Web   y más ", tagline: " Lema ", planet: "gdg" });

      expect(result).toEqual(ok({ id: "web", name: "Web y más", tagline: "Lema", planet: "gdg", order: 3, active: true }));
      expect(ctx.entries[0]).toMatchObject({ action: "quadrant.created", targetUid: "web" });
    });

    it.each([
      [{ name: "x" }, "invalid-name"],
      [{ tagline: "" }, "invalid-tagline"],
      [{ planet: "moon" }, "invalid-planet"],
      [{ id: "Web Dev" }, "invalid-id"],
      [{ id: "aa" }, "already-exists"],
    ])("refuses %j", async (change, code) => {
      expect(await createQuadrant(ctx.deps, ADMIN, { id: "web", name: "Web", tagline: "Lema", planet: "gdg", ...change })).toEqual(err({ code }));
    });

    it("updates name, tagline and planet, auditing only what changed", async () => {
      expect(await updateQuadrant(ctx.deps, ADMIN, { id: "aa", name: "AA", tagline: "Otro lema", planet: "cloud" })).toMatchObject({ ok: true, value: { tagline: "Otro lema", planet: "cloud" } });
      expect(ctx.entries[0].details).toEqual({ changed: "tagline,planet" });

      await updateQuadrant(ctx.deps, ADMIN, { id: "aa", name: "AA", tagline: "Otro lema", planet: "cloud" });
      expect(ctx.entries).toHaveLength(1);
    });

    it("is not found for an unknown quadrant", async () => {
      expect(await updateQuadrant(ctx.deps, ADMIN, { id: "zz", name: "Zeta", tagline: "Lema", planet: "ai" })).toEqual(err({ code: "not-found" }));
      expect(await setQuadrantActive(ctx.deps, ADMIN, { id: "zz", active: false })).toEqual(err({ code: "not-found" }));
      expect(await moveQuadrant(ctx.deps, ADMIN, { id: "zz", to: 0 })).toEqual(err({ code: "not-found" }));
    });

    it("activates and deactivates, auditing real changes", async () => {
      await setQuadrantActive(ctx.deps, ADMIN, { id: "aa", active: false });
      await setQuadrantActive(ctx.deps, ADMIN, { id: "aa", active: false });
      await setQuadrantActive(ctx.deps, ADMIN, { id: "aa", active: true });

      expect(ctx.entries.map((entry) => entry.action)).toEqual(["quadrant.deactivated", "quadrant.activated"]);
    });

    it("moves one place, and does nothing at the ends", async () => {
      expect(await moveQuadrant(ctx.deps, ADMIN, { id: "bb", to: 0 })).toEqual(ok(["bb", "aa", "cc"]));
      expect(await moveQuadrant(ctx.deps, ADMIN, { id: "cc", to: 9 })).toEqual(ok(["bb", "aa", "cc"]));
      expect(ctx.deps.store.setQuadrantOrder).toHaveBeenCalledTimes(1);
    });
  });

  describe("venue", () => {
    it("offers the bundled plan and quadrants to edit while the edition has none", async () => {
      const empty = setup({ quadrants: [] });

      expect(await getVenueForEdit(empty.deps, ADMIN)).toEqual(ok({ venue: DEFAULTS.venue, isDefault: true, quadrants: DEFAULTS.quadrants }));
    });

    it("offers the edition's own plan and every quadrant, active or not", async () => {
      const own = plan([stand("bb-1", "bb", 0)]);
      const mine = setup({ quadrants: [quadrant("bb", 1, { active: false }), quadrant("aa", 0)], venue: own });

      const result = await getVenueForEdit(mine.deps, ADMIN);

      expect(result.ok && result.value.isDefault).toBe(false);
      expect(result.ok && result.value.venue).toEqual(own);
      expect(result.ok && result.value.quadrants.map((q) => q.id)).toEqual(["aa", "bb"]);
    });

    it("saves a drawable plan, gives every stand its QR, and audits it", async () => {
      const next = plan([stand("aa-1", "aa", 0), { id: "hall", kind: "auditorium", label: "Auditorio", quadrantId: null, rect: { x: 30, y: 30, width: 40, height: 40 } }]);

      const result = await saveVenue(ctx.deps, ADMIN, next);

      expect(result).toEqual(ok({ venue: { ...next, background: null }, standQrs: ["stand-aa-1"], failedQrs: [] }));
      expect(ctx.saved.venue).toEqual({ ...next, background: null });
      expect(ctx.entries[0]).toMatchObject({ action: "venue.saved", details: { areas: "2", standQrs: "stand-aa-1", background: "no" } });
    });

    it("keeps the real plan under the grid, deletes the one it replaces, and refuses another kind's image", async () => {
      const first = "public/devfest-2026/venue-plan/0f8e2c1a-1111-4222-8333-944455550000.svg";
      const second = "public/devfest-2026/venue-plan/0f8e2c1a-1111-4222-8333-944455551111.svg";
      const next = plan([stand("aa-1", "aa", 0)]);

      const saved = await saveVenue(ctx.deps, ADMIN, { ...next, backgroundPath: first });
      expect(saved).toMatchObject({ ok: true, value: { venue: { background: { path: first, url: `https://cdn/${first}` } } } });
      ctx.deps.store.loadVenue.mockResolvedValue(ok(ctx.saved.venue));

      await saveVenue(ctx.deps, ADMIN, { ...next, backgroundPath: first });
      expect(ctx.deps.images.remove).not.toHaveBeenCalled();
      await saveVenue(ctx.deps, ADMIN, { ...next, backgroundPath: second });
      expect(ctx.deps.images.remove).toHaveBeenCalledWith(first);

      expect(await saveVenue(ctx.deps, ADMIN, { ...next, backgroundPath: "public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455551111.webp" })).toEqual(err({ code: "invalid-image" }));
    });

    it("reports stands whose QR could not be created, keeping the saved plan", async () => {
      ctx.deps.stands.ensure.mockResolvedValueOnce({ created: [], failed: ["stand-aa-1"] });

      expect(await saveVenue(ctx.deps, ADMIN, plan([stand("aa-1", "aa", 0)]))).toMatchObject({ ok: true, value: { failedQrs: ["stand-aa-1"] } });
    });

    it("refuses a plan that cannot be drawn, or a stand of an unknown quadrant", async () => {
      expect(await saveVenue(ctx.deps, ADMIN, plan([stand("aa-1", "aa", 0), stand("aa-2", "aa", 5)]))).toEqual(err({ code: "invalid-venue" }));
      expect(await saveVenue(ctx.deps, ADMIN, plan([stand("x-1", "ghost", 0)]))).toEqual(err({ code: "unknown-quadrant" }));
      expect(ctx.deps.store.saveVenue).not.toHaveBeenCalled();
    });

    it("accepts stands of the bundled quadrants while the edition has none of its own", async () => {
      const empty = setup({ quadrants: [] });

      expect(await saveVenue(empty.deps, ADMIN, plan([stand("ai-9", "ai", 0)]))).toMatchObject({ ok: true });
    });

    it("reports failed reads and writes", async () => {
      ctx.deps.store.saveVenue.mockResolvedValueOnce(err({ code: "x" }));
      expect(await saveVenue(ctx.deps, ADMIN, plan([stand("aa-1", "aa", 0)]))).toEqual(err({ code: "unknown" }));
      expect(ctx.deps.stands.ensure).not.toHaveBeenCalled();

      ctx.deps.store.loadVenue.mockResolvedValueOnce(err({ code: "x" }));
      expect(await getVenueForEdit(ctx.deps, ADMIN)).toEqual(err({ code: "unknown" }));
    });
  });
});
