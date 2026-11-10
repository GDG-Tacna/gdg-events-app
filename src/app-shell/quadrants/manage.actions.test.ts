import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/quadrant-admin.server", () => ({ quadrantAdminDeps: { marker: "admin" } }));
const source = { invalidate: vi.fn() };
vi.mock("@/app-shell/composition/quadrants.server", () => ({ quadrantSource: source }));

const deletion = vi.hoisted(() => ({ mayDeleteItems: vi.fn(async () => true) }));
vi.mock("@/app-shell/deletion.server", () => deletion);
const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = {
  seedLayout: vi.fn(),
  createQuadrant: vi.fn(),
  updateQuadrant: vi.fn(),
  setQuadrantActive: vi.fn(),
  moveQuadrant: vi.fn(),
  deleteQuadrant: vi.fn(),
  saveVenue: vi.fn(),
};
vi.mock("@/features/quadrants/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true, map: true } }));
vi.mock("@/shared/config/features", () => features);

const actions = await import("./manage.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const ADMIN = { uid: "a1", role: "admin" };
const QUADRANT = { id: "ai", name: "AI", tagline: "Lema", planet: "ai" };
const VENUE = { width: 100, height: 100, areas: [{ id: "ai-1", kind: "stand", label: "Stand", quadrantId: "ai", rect: { x: 0, y: 0, width: 10, height: 10 } }] };

describe("map admin actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.map = true;
    guards.getSession.mockResolvedValue(session("admin"));
    deletion.mayDeleteItems.mockResolvedValue(true);
    for (const name of ["createQuadrant", "updateQuadrant", "setQuadrantActive", "moveQuadrant", "deleteQuadrant"] as const) server[name].mockResolvedValue({ ok: true, value: null });
    server.seedLayout.mockResolvedValue({ ok: true, value: { quadrants: 5, standQrs: ["stand-a"] } });
    server.saveVenue.mockResolvedValue({ ok: true, value: { venue: VENUE, standQrs: ["stand-ai-1"], failedQrs: ["stand-x"] } });
  });

  const calls = [
    ["seed", () => actions.seedLayoutAction()],
    ["create", () => actions.createQuadrantAction(QUADRANT)],
    ["update", () => actions.updateQuadrantAction(QUADRANT)],
    ["activate", () => actions.setQuadrantActiveAction({ id: "ai", active: true })],
    ["move", () => actions.moveQuadrantAction({ id: "ai", to: 0 })],
    ["delete", () => actions.deleteQuadrantAction({ id: "ai" })],
    ["save venue", () => actions.saveVenueAction(VENUE as never)],
  ] as const;

  it.each(calls)("%s is off with the admin switched off, and only for admins", async (_, call) => {
    features.FEATURES.admin = false;
    expect(await call()).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await call()).toEqual({ ok: false, code: "forbidden" });
    expect(source.invalidate).not.toHaveBeenCalled();
  });

  it("keeps the zones editable with the map switched off (they group the missions); only the plan is off", async () => {
    features.FEATURES.map = false;

    expect(await actions.seedLayoutAction()).toEqual({ ok: false, code: "disabled" });
    expect(await actions.saveVenueAction(VENUE as never)).toEqual({ ok: false, code: "disabled" });
    expect(await actions.createQuadrantAction(QUADRANT)).toEqual({ ok: true });
    expect(await actions.setQuadrantActiveAction({ id: "ai", active: false })).toEqual({ ok: true });
    expect(server.saveVenue).not.toHaveBeenCalled();
  });

  it("seeds, reports the stand QR codes, and drops the attendees' cached map", async () => {
    expect(await actions.seedLayoutAction()).toEqual({ ok: true, standQrs: ["stand-a"], failedQrs: [] });
    expect(server.seedLayout).toHaveBeenCalledWith({ marker: "admin" }, ADMIN);
    expect(source.invalidate).toHaveBeenCalledTimes(1);
  });

  it("creates, updates, activates and moves with the actor of the session", async () => {
    await actions.createQuadrantAction(QUADRANT);
    await actions.updateQuadrantAction(QUADRANT);
    await actions.setQuadrantActiveAction({ id: "ai", active: false });
    await actions.moveQuadrantAction({ id: "ai", to: 2 });

    expect(server.createQuadrant).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, QUADRANT);
    expect(server.updateQuadrant).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, QUADRANT);
    expect(server.setQuadrantActive).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, { id: "ai", active: false });
    expect(server.moveQuadrant).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, { id: "ai", to: 2 });
    expect(source.invalidate).toHaveBeenCalledTimes(4);
  });

  it("deletes a zone with the actor of the session and drops the attendees' cached map", async () => {
    expect(await actions.deleteQuadrantAction({ id: "ai" })).toEqual({ ok: true });

    expect(server.deleteQuadrant).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, { id: "ai", overrideReferences: false });
    expect(source.invalidate).toHaveBeenCalledTimes(1);
  });

  it("lets only an admin of every edition go past what still points at the zone", async () => {
    guards.getSession.mockResolvedValue({ ...session("admin"), adminScope: "global" });

    await actions.deleteQuadrantAction({ id: "ai" });

    expect(server.deleteQuadrant).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, { id: "ai", overrideReferences: true });
  });

  it("refuses to delete once the edition is published, unless the admin is allowed to, and keeps the cache", async () => {
    deletion.mayDeleteItems.mockResolvedValue(false);

    expect(await actions.deleteQuadrantAction({ id: "ai" })).toEqual({ ok: false, code: "edition-locked" });

    expect(server.deleteQuadrant).not.toHaveBeenCalled();
    expect(source.invalidate).not.toHaveBeenCalled();
  });

  it("deletes only with a well-formed input, and passes a refusal through", async () => {
    expect(await actions.deleteQuadrantAction({ id: 7 } as never)).toEqual({ ok: false, code: "not-found" });
    server.deleteQuadrant.mockResolvedValue({ ok: false, error: { code: "has-missions" } });

    expect(await actions.deleteQuadrantAction({ id: "ai" })).toEqual({ ok: false, code: "has-missions" });
    expect(source.invalidate).not.toHaveBeenCalled();
  });

  it("saves the plan and reports created and failed stand QR codes", async () => {
    expect(await actions.saveVenueAction(VENUE as never)).toEqual({ ok: true, standQrs: ["stand-ai-1"], failedQrs: ["stand-x"] });
    expect(server.saveVenue).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, VENUE);
    expect(source.invalidate).toHaveBeenCalled();
  });

  it.each([
    ["areas that are not a list", { width: 10, height: 10, areas: "x" }],
    ["too many areas", { width: 10, height: 10, areas: Array(81).fill(VENUE.areas[0]) }],
    ["a size as text", { ...VENUE, width: "100" }],
  ])("rejects a plan with %s before touching the use case", async (_, venue) => {
    expect(await actions.saveVenueAction(venue as never)).toEqual({ ok: false, code: "invalid-venue" });
    expect(server.saveVenue).not.toHaveBeenCalled();
  });

  it("rejects malformed quadrant, activate and move inputs", async () => {
    expect(await actions.createQuadrantAction({ ...QUADRANT, name: 42 } as never)).toEqual({ ok: false, code: "invalid-name" });
    expect(await actions.setQuadrantActiveAction({ id: "ai", active: "no" } as never)).toEqual({ ok: false, code: "not-found" });
    expect(await actions.moveQuadrantAction({ id: "ai", to: 1000 })).toEqual({ ok: false, code: "not-found" });
  });

  it("passes refusals through and keeps the cache", async () => {
    server.saveVenue.mockResolvedValue({ ok: false, error: { code: "unknown-quadrant" } });
    server.seedLayout.mockResolvedValue({ ok: false, error: { code: "already-seeded" } });

    expect(await actions.saveVenueAction(VENUE as never)).toEqual({ ok: false, code: "unknown-quadrant" });
    expect(await actions.seedLayoutAction()).toEqual({ ok: false, code: "already-seeded" });
    expect(source.invalidate).not.toHaveBeenCalled();
  });
});
