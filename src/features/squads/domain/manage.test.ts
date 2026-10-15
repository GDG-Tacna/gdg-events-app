import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import type { PixelSpriteData } from "@/shared/types/pixel";
import {
  createSquad,
  listManagedSquads,
  moveSquad,
  reactivateSquad,
  retireSquad,
  seedSquads,
  squadAdminError,
  updateSquad,
  type ManagedSquad,
  type SquadAdminDeps,
  type SquadStore,
} from "./manage";
import type { Squad } from "./squad";
import { FALLBACK_LOGO } from "./squad-rules";

const NOW = new Date("2026-10-25T12:00:00Z");
const ADMIN = { uid: "a1", role: "admin" as const };

const rows = Array.from({ length: 16 }, (_, y) => (y === 8 ? ".......a........" : "................"));
const LOGO: PixelSpriteData = { rows, palette: { a: "#22d3ee" } };
const squad = (id: string, order: number, active = true): ManagedSquad => ({
  id,
  name: `Escuadrón ${id}`,
  tagline: "Lema del escuadrón",
  sprite: LOGO,
  active,
  order,
});

function setup(stored: ManagedSquad[] = [squad("angular", 0), squad("firebase", 1), squad("gemini", 2)], options: { finished?: Result<boolean, { code: string }>; auditFails?: boolean } = {}) {
  let current = [...stored];
  const store: SquadStore = {
    list: vi.fn(async () => ok([...current].sort((a, b) => a.order - b.order))),
    create: vi.fn(async (created: ManagedSquad) => {
      if (current.some((existing) => existing.id === created.id)) return err({ code: "already-exists" as const });
      current.push(created);
      return ok(undefined);
    }),
    update: vi.fn(async (id: string, patch) => {
      const before = current.find((existing) => existing.id === id);
      if (!before) return ok(null);
      const after = { ...before, ...patch };
      current = current.map((existing) => (existing.id === id ? after : existing));
      return ok({ before, after });
    }),
    setOrder: vi.fn(async (ids: readonly string[]) => {
      current = current.map((existing) => ({ ...existing, order: ids.indexOf(existing.id) }));
      return ok(undefined);
    }),
  };
  const clock = { hasFinished: vi.fn(async () => options.finished ?? ok(true)) };
  const audit = { append: vi.fn(async () => (options.auditFails ? err({ code: "unknown" }) : ok(undefined))) };
  const images = { ref: vi.fn((path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null)), remove: vi.fn(async () => {}) };
  const deps: SquadAdminDeps = { store, clock, images, audit, now: () => NOW };
  return { deps, store, clock, audit, images, current: () => current };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const NOT_ADMINS = [[{ uid: "s1", role: "staff" }], [{ uid: "u1", role: "attendee" }], [{ uid: "x", role: null }]] as const;

describe("retireSquad", () => {
  it("retires a squad once the event is over, and audits it", async () => {
    const t = setup();

    const result = await retireSquad(t.deps, ADMIN, { id: "firebase" });

    expect(result).toMatchObject({ ok: true, value: { id: "firebase", active: false } });
    expect(t.store.update).toHaveBeenCalledWith("firebase", { active: false });
    expect(t.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "squad.retired", targetUid: "firebase" }));
  });

  it("refuses while the event is not over (or has no end date), and changes nothing", async () => {
    const t = setup(undefined, { finished: ok(false) });

    expect(await retireSquad(t.deps, ADMIN, { id: "firebase" })).toEqual(err(squadAdminError("event-not-finished")));
    expect(t.store.update).not.toHaveBeenCalled();
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("refuses when it cannot tell whether the event is over", async () => {
    const t = setup(undefined, { finished: err({ code: "unknown" }) });

    expect(await retireSquad(t.deps, ADMIN, { id: "firebase" })).toEqual(err(squadAdminError("unknown")));
    expect(t.store.update).not.toHaveBeenCalled();
  });

  it.each(NOT_ADMINS)("is for admins only: %j is refused before asking anything", async (actor) => {
    const t = setup();

    expect(await retireSquad(t.deps, actor, { id: "firebase" })).toEqual(err(squadAdminError("forbidden")));
    expect(t.clock.hasFinished).not.toHaveBeenCalled();
  });

  it("says so for an unknown squad", async () => {
    expect(await retireSquad(setup().deps, ADMIN, { id: "cloud" })).toEqual(err(squadAdminError("not-found")));
    expect(await retireSquad(setup().deps, ADMIN, { id: "../x" })).toEqual(err(squadAdminError("not-found")));
  });

  it("writes no audit line when it was already retired", async () => {
    const t = setup([squad("cloud", 0, false)]);

    await retireSquad(t.deps, ADMIN, { id: "cloud" });

    expect(t.audit.append).not.toHaveBeenCalled();
  });
});

describe("reactivateSquad", () => {
  it("offers a retired squad again at any time, even before the event is over", async () => {
    const t = setup([squad("cloud", 0, false)], { finished: ok(false) });

    expect(await reactivateSquad(t.deps, ADMIN, { id: "cloud" })).toMatchObject({ ok: true, value: { active: true } });
    expect(t.clock.hasFinished).not.toHaveBeenCalled();
    expect(t.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "squad.reactivated" }));
  });

  it.each(NOT_ADMINS)("is for admins only: %j", async (actor) => {
    expect(await reactivateSquad(setup().deps, actor, { id: "cloud" })).toEqual(err(squadAdminError("forbidden")));
  });
});

describe("seedSquads", () => {
  const SEED: Squad[] = [
    { id: "angular", name: "Escuadrón Angular", tagline: "Lema A", sprite: LOGO, active: true },
    { id: "gemini", name: "Escuadrón Gemini", tagline: "Lema G", sprite: LOGO, active: true },
  ];

  it("loads the first squads into an empty edition, in order, and audits it once", async () => {
    const t = setup([]);

    const result = await seedSquads(t.deps, ADMIN, SEED);

    expect(result).toMatchObject({ ok: true, value: [{ id: "angular", order: 0 }, { id: "gemini", order: 1 }] });
    expect(t.current().map((created) => created.id)).toEqual(["angular", "gemini"]);
    expect(t.audit.append).toHaveBeenCalledTimes(1);
    expect(t.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "squads.seeded", details: { ids: "angular,gemini" } }));
  });

  it("never seeds over squads that already exist", async () => {
    const t = setup();

    expect(await seedSquads(t.deps, ADMIN, SEED)).toEqual(err(squadAdminError("already-seeded")));
    expect(t.store.create).not.toHaveBeenCalled();
  });

  it.each(NOT_ADMINS)("is for admins only: %j", async (actor) => {
    expect(await seedSquads(setup([]).deps, actor, SEED)).toEqual(err(squadAdminError("forbidden")));
  });
});

describe("createSquad", () => {
  it("creates an active squad at the end of the list", async () => {
    const t = setup();

    const result = await createSquad(t.deps, ADMIN, { id: "android", name: " Escuadrón  Android ", tagline: "Robots verdes", sprite: LOGO });

    expect(result).toEqual(ok({ id: "android", name: "Escuadrón Android", tagline: "Robots verdes", sprite: LOGO, logo: null, active: true, order: 3 }));
    expect(t.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "squad.created", targetUid: "android" }));
  });

  describe("uploaded logo", () => {
    const PATH = "public/devfest-2026/squad-logo/0f8e2c1a-1111-4222-8333-944455551111.svg";
    const BLANK = { rows: Array.from({ length: 16 }, () => ".".repeat(16)), palette: {} };

    it("creates a squad with an uploaded logo and no drawing, keeping a plain shield as its pixel fallback", async () => {
      const t = setup();

      const result = await createSquad(t.deps, ADMIN, { id: "android", name: "Escuadrón Android", tagline: "Robots verdes", sprite: BLANK, logoPath: PATH });

      expect(result).toMatchObject({ ok: true, value: { logo: { path: PATH, url: `https://cdn/${PATH}` }, sprite: FALLBACK_LOGO } });
    });

    it("still asks for a drawing without an uploaded logo, and refuses another kind's image", async () => {
      const t = setup();
      const base = { id: "android", name: "Escuadrón Android", tagline: "Robots verdes" };

      expect(await createSquad(t.deps, ADMIN, { ...base, sprite: BLANK })).toEqual(err(squadAdminError("invalid-logo")));
      expect(await createSquad(t.deps, ADMIN, { ...base, sprite: LOGO, logoPath: "public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455551111.webp" })).toEqual(err(squadAdminError("invalid-image")));
    });

    it("replaces and removes the uploaded logo, deleting the old file and auditing it", async () => {
      const t = setup();
      await updateSquad(t.deps, ADMIN, { id: "gemini", logoPath: PATH });
      expect(t.current().find((squad) => squad.id === "gemini")?.logo).toEqual({ path: PATH, url: `https://cdn/${PATH}` });

      await updateSquad(t.deps, ADMIN, { id: "gemini", logoPath: null, sprite: BLANK }).then((result) => expect(result).toEqual(err(squadAdminError("invalid-logo"))));
      await updateSquad(t.deps, ADMIN, { id: "gemini", logoPath: null });
      expect(t.images.remove).toHaveBeenCalledWith(PATH);
      expect(t.audit.append).toHaveBeenLastCalledWith(expect.objectContaining({ details: { changed: "uploaded-logo" } }));
    });
  });

  it("validates the name, tagline, id and logo in that order, without writing", async () => {
    const t = setup();
    const base = { id: "android", name: "Escuadrón Android", tagline: "Robots verdes", sprite: LOGO };

    expect(await createSquad(t.deps, ADMIN, { ...base, name: "x" })).toEqual(err(squadAdminError("invalid-name")));
    expect(await createSquad(t.deps, ADMIN, { ...base, tagline: "" })).toEqual(err(squadAdminError("invalid-tagline")));
    expect(await createSquad(t.deps, ADMIN, { ...base, id: "Android!" })).toEqual(err(squadAdminError("invalid-id")));
    expect(await createSquad(t.deps, ADMIN, { ...base, sprite: { rows: [], palette: {} } })).toEqual(err(squadAdminError("invalid-logo")));
    expect(t.store.create).not.toHaveBeenCalled();
  });

  it("refuses a taken id: profiles store it", async () => {
    const t = setup();

    expect(await createSquad(t.deps, ADMIN, { id: "gemini", name: "Otro", tagline: "Otro lema", sprite: LOGO })).toEqual(
      err(squadAdminError("already-exists")),
    );
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it.each(NOT_ADMINS)("is for admins only: %j", async (actor) => {
    expect(await createSquad(setup().deps, actor, { id: "x-1", name: "Xx", tagline: "Yy", sprite: LOGO })).toEqual(err(squadAdminError("forbidden")));
  });
});

describe("updateSquad", () => {
  const OTHER_LOGO: PixelSpriteData = { rows, palette: { a: "#a3e635" } };

  it("changes what was sent, audits which fields changed, and never touches the id", async () => {
    const t = setup();

    const result = await updateSquad(t.deps, ADMIN, { id: "gemini", name: "Escuadrón Géminis", sprite: OTHER_LOGO });

    expect(result).toMatchObject({ ok: true, value: { id: "gemini", name: "Escuadrón Géminis", sprite: OTHER_LOGO, tagline: "Lema del escuadrón" } });
    expect(t.store.update).toHaveBeenCalledWith("gemini", { name: "Escuadrón Géminis", sprite: OTHER_LOGO });
    expect(t.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "squad.updated", details: { changed: "name,logo" } }));
  });

  it("writes no audit line when nothing changed", async () => {
    const t = setup();

    await updateSquad(t.deps, ADMIN, { id: "gemini", name: "Escuadrón gemini", tagline: "Lema del escuadrón" });

    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("validates what was sent and refuses unknown squads", async () => {
    const t = setup();

    expect(await updateSquad(t.deps, ADMIN, { id: "gemini", name: "x" })).toEqual(err(squadAdminError("invalid-name")));
    expect(await updateSquad(t.deps, ADMIN, { id: "gemini", tagline: "x".repeat(81) })).toEqual(err(squadAdminError("invalid-tagline")));
    expect(await updateSquad(t.deps, ADMIN, { id: "gemini", sprite: "nope" })).toEqual(err(squadAdminError("invalid-logo")));
    expect(t.store.update).not.toHaveBeenCalled();
    expect(await updateSquad(t.deps, ADMIN, { id: "cloud", name: "Nube" })).toEqual(err(squadAdminError("not-found")));
  });

  it.each(NOT_ADMINS)("is for admins only: %j", async (actor) => {
    expect(await updateSquad(setup().deps, actor, { id: "gemini", name: "Otro" })).toEqual(err(squadAdminError("forbidden")));
  });
});

describe("moveSquad", () => {
  it("moves a squad one place up or down and saves the whole order", async () => {
    const t = setup();

    expect(await moveSquad(t.deps, ADMIN, { id: "gemini", to: 1 })).toEqual(ok(["angular", "gemini", "firebase"]));
    expect(t.store.setOrder).toHaveBeenCalledWith(["angular", "gemini", "firebase"]);
    expect(await moveSquad(t.deps, ADMIN, { id: "angular", to: 1 })).toEqual(ok(["gemini", "angular", "firebase"]));
  });

  it("is a no-op at either end, without writing or auditing", async () => {
    const t = setup();

    expect(await moveSquad(t.deps, ADMIN, { id: "angular", to: 0 })).toEqual(ok(["angular", "firebase", "gemini"]));
    expect(await moveSquad(t.deps, ADMIN, { id: "gemini", to: 9 })).toEqual(ok(["angular", "firebase", "gemini"]));
    expect(t.store.setOrder).not.toHaveBeenCalled();
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("says so for an unknown squad, and is for admins only", async () => {
    expect(await moveSquad(setup().deps, ADMIN, { id: "cloud", to: 0 })).toEqual(err(squadAdminError("not-found")));
    expect(await moveSquad(setup().deps, { uid: "s1", role: "staff" }, { id: "gemini", to: 0 })).toEqual(err(squadAdminError("forbidden")));
  });
});

describe("listManagedSquads", () => {
  it("lists every squad, retired ones included, to an admin", async () => {
    const t = setup([squad("angular", 0), squad("cloud", 1, false)]);

    expect(await listManagedSquads(t.deps, ADMIN)).toMatchObject({ ok: true, value: [{ id: "angular" }, { id: "cloud", active: false }] });
    expect(await listManagedSquads(t.deps, { uid: "s1", role: "staff" })).toEqual(err(squadAdminError("forbidden")));
  });
});

describe("audit failures", () => {
  it("keep a change that already happened, and say so in the log", async () => {
    const t = setup(undefined, { auditFails: true });

    expect(await retireSquad(t.deps, ADMIN, { id: "firebase" })).toMatchObject({ ok: true });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("squads.audit.append"));
  });
});
