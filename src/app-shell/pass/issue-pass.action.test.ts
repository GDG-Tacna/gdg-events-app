import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/pass.server", () => ({ passDeps: { marker: "deps" } }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const passServer = { issuePass: vi.fn() };
vi.mock("@/features/pass/server", () => passServer);

const features = vi.hoisted(() => ({ FEATURES: { checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { issuePassAction } = await import("./issue-pass.action");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "u1", role, displayName: null, photoUrl: null });

describe("issuePassAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.checkins = true;
    guards.getSession.mockResolvedValue(session("attendee"));
  });

  it("does nothing when check-ins are switched off", async () => {
    features.FEATURES.checkins = false;

    expect(await issuePassAction()).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    guards.getSession.mockResolvedValue(null);

    expect(await issuePassAction()).toEqual({ ok: false, code: "unauthenticated" });
    expect(passServer.issuePass).not.toHaveBeenCalled();
  });

  it("takes the uid and role from the session: the action has no input to tamper with", async () => {
    passServer.issuePass.mockReturnValue({ ok: true, value: { cells: ["101"], issuedAt: 1, expiresAt: 61_000 } });

    const result = await issuePassAction();

    expect(passServer.issuePass).toHaveBeenCalledWith({ marker: "deps" }, { uid: "u1", role: "attendee" });
    expect(result).toEqual({ ok: true, pass: { cells: ["101"], issuedAt: 1, expiresAt: 61_000 } });
    expect(issuePassAction.length).toBe(0);
  });

  it("maps a use case failure to its code only", async () => {
    guards.getSession.mockResolvedValue(session("staff"));
    passServer.issuePass.mockReturnValue({ ok: false, error: { code: "forbidden" } });

    expect(await issuePassAction()).toEqual({ ok: false, code: "forbidden" });
  });
});
