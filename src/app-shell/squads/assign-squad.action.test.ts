import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/squads.server", () => ({ squadDeps: { marker: "deps" } }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const squadsServer = { assignSquad: vi.fn() };
vi.mock("@/features/squads/server", () => squadsServer);

const features = vi.hoisted(() => ({ FEATURES: { squads: true } }));
vi.mock("@/shared/config/features", () => features);

const { assignSquadAction } = await import("./assign-squad.action");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "u1", role, displayName: null, photoUrl: null });

describe("assignSquadAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.squads = true;
  });

  it("does nothing when the squads feature is switched off", async () => {
    features.FEATURES.squads = false;
    guards.getSession.mockResolvedValue(session("attendee"));

    expect(await assignSquadAction()).toEqual({ ok: false, code: "disabled" });
    expect(squadsServer.assignSquad).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    guards.getSession.mockResolvedValue(null);

    expect(await assignSquadAction()).toEqual({ ok: false, code: "unauthenticated" });
    expect(squadsServer.assignSquad).not.toHaveBeenCalled();
  });

  it("sends a user without a profile back to onboarding", async () => {
    guards.getSession.mockResolvedValue(session(null));

    expect(await assignSquadAction()).toEqual({ ok: false, code: "not-registered" });
    expect(squadsServer.assignSquad).not.toHaveBeenCalled();
  });

  it.each(["staff", "admin"] as const)("does not assign squads to %s accounts", async (role) => {
    guards.getSession.mockResolvedValue(session(role));

    expect(await assignSquadAction()).toEqual({ ok: false, code: "forbidden" });
    expect(squadsServer.assignSquad).not.toHaveBeenCalled();
  });

  it("assigns using the uid of the verified session, with no input from the client", async () => {
    guards.getSession.mockResolvedValue(session("attendee"));
    squadsServer.assignSquad.mockResolvedValue({ ok: true, value: { squad: "cloud", assigned: true } });

    const result = await (assignSquadAction as (...args: unknown[]) => ReturnType<typeof assignSquadAction>)("firebase", "someone-else");

    expect(result).toEqual({ ok: true, squad: "cloud", assigned: true });
    expect(squadsServer.assignSquad).toHaveBeenCalledWith(expect.anything(), "u1");
  });

  it("returns the existing squad on a repeat call", async () => {
    guards.getSession.mockResolvedValue(session("attendee"));
    squadsServer.assignSquad.mockResolvedValue({ ok: true, value: { squad: "firebase", assigned: false } });

    expect(await assignSquadAction()).toEqual({ ok: true, squad: "firebase", assigned: false });
  });

  it("passes a failure code back to the screen", async () => {
    guards.getSession.mockResolvedValue(session("attendee"));
    squadsServer.assignSquad.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(await assignSquadAction()).toEqual({ ok: false, code: "unknown" });
  });
});
