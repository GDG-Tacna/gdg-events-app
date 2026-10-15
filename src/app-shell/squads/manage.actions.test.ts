import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/squad-admin.server", () => ({ squadAdminDeps: { marker: "deps" } }));
const catalog = vi.hoisted(() => ({ invalidate: vi.fn() }));
vi.mock("@/app-shell/composition/squads.server", () => ({ squadCatalog: catalog }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = vi.hoisted(() => ({
  STATIC_SQUADS: [{ id: "angular" }],
  seedSquads: vi.fn(),
  createSquad: vi.fn(),
  updateSquad: vi.fn(),
  retireSquad: vi.fn(),
  reactivateSquad: vi.fn(),
  moveSquad: vi.fn(),
}));
vi.mock("@/features/squads/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true, squads: true } }));
vi.mock("@/shared/config/features", () => features);

const actions = await import("./manage.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const rows = Array.from({ length: 16 }, () => "................");
const SQUAD = { id: "android", name: "Android", tagline: "Robots", sprite: { rows, palette: { a: "#000000" } } };

describe.each([
  ["seedSquadsAction", () => actions.seedSquadsAction(), server.seedSquads],
  ["createSquadAction", () => actions.createSquadAction(SQUAD), server.createSquad],
  ["updateSquadAction", () => actions.updateSquadAction(SQUAD), server.updateSquad],
  ["retireSquadAction", () => actions.retireSquadAction({ id: "gemini" }), server.retireSquad],
  ["reactivateSquadAction", () => actions.reactivateSquadAction({ id: "gemini" }), server.reactivateSquad],
  ["moveSquadAction", () => actions.moveSquadAction({ id: "gemini", to: 0 }), server.moveSquad],
] as const)("%s", (_name, call, useCase) => {
  beforeEach(() => {
    vi.clearAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.squads = true;
    guards.getSession.mockResolvedValue(session("admin"));
  });

  it.each([["admin"], ["squads"]] as const)("does nothing when the %s feature is switched off", async (flag) => {
    features.FEATURES[flag] = false;

    expect(await call()).toEqual({ ok: false, code: "disabled" });
    expect(useCase).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller and every role but admin", async () => {
    guards.getSession.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, code: "unauthenticated" });

    for (const role of ["attendee", "staff", null] as const) {
      guards.getSession.mockResolvedValue(session(role));
      expect(await call()).toEqual({ ok: false, code: "forbidden" });
    }
    expect(useCase).not.toHaveBeenCalled();
  });

  it("uses the actor of the session, and drops the attendees' cached catalog after a change", async () => {
    useCase.mockResolvedValue({ ok: true, value: {} });

    expect(await call()).toEqual({ ok: true });
    expect(useCase.mock.calls[0][0]).toEqual({ marker: "deps" });
    expect(useCase.mock.calls[0][1]).toEqual({ uid: "a1", role: "admin" });
    expect(catalog.invalidate).toHaveBeenCalledTimes(1);
  });

  it("maps a failure to its code only, and keeps the cache", async () => {
    useCase.mockResolvedValue({ ok: false, error: { code: "event-not-finished" } });

    expect(await call()).toEqual({ ok: false, code: "event-not-finished" });
    expect(catalog.invalidate).not.toHaveBeenCalled();
  });
});

describe("squad action input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.squads = true;
    guards.getSession.mockResolvedValue(session("admin"));
  });

  it("seeds DevFest's own squads, never anything sent by the client", async () => {
    server.seedSquads.mockResolvedValue({ ok: true, value: [] });

    await actions.seedSquadsAction();

    expect(server.seedSquads.mock.calls[0][2]).toBe(server.STATIC_SQUADS);
  });

  it("rejects input of the wrong shape or absurd size before the use case", async () => {
    expect(await actions.createSquadAction({ ...SQUAD, sprite: "nope" as never })).toMatchObject({ ok: false });
    expect(await actions.updateSquadAction({ ...SQUAD, name: "x".repeat(201) })).toMatchObject({ ok: false });
    expect(await actions.moveSquadAction({ id: "gemini", to: "1" as never })).toEqual({ ok: false, code: "not-found" });
    expect(await actions.retireSquadAction({ id: 5 as never })).toEqual({ ok: false, code: "not-found" });
    expect(server.createSquad).not.toHaveBeenCalled();
    expect(server.updateSquad).not.toHaveBeenCalled();
    expect(server.moveSquad).not.toHaveBeenCalled();
    expect(server.retireSquad).not.toHaveBeenCalled();
  });
});
