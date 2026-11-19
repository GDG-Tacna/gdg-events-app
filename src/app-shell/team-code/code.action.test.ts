import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/team-code.server", () => ({ teamCodeDeps: { marker: "team-codes" } }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = vi.hoisted(() => ({ issueTeamCode: vi.fn() }));
vi.mock("@/features/team-code/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { issueTeamCodeAction } = await import("./code.action");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "u1", role, displayName: null, photoUrl: null });
const ISSUED = { role: "volunteer", cells: ["101"], issuedAt: 1, expiresAt: 2 };

describe("issueTeamCodeAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.checkins = true;
    guards.getSession.mockResolvedValue(session("staff"));
    server.issueTeamCode.mockReturnValue({ ok: true, value: ISSUED });
  });

  it("answers the picture and timing for the session's uid and role, never the signed text", async () => {
    expect(await issueTeamCodeAction()).toEqual({ ok: true, qr: { checkpointId: "volunteer", name: "volunteer", cells: ["101"], issuedAt: 1, expiresAt: 2 } });
    expect(server.issueTeamCode).toHaveBeenCalledWith({ marker: "team-codes" }, { uid: "u1", role: "staff" });

    // An admin (an organizer resolves to one) is passed on as it is: the use case picks the role the code carries.
    guards.getSession.mockResolvedValue(session("admin"));
    server.issueTeamCode.mockReturnValue({ ok: true, value: { ...ISSUED, role: "organizer" } });
    expect(await issueTeamCodeAction()).toMatchObject({ ok: true, qr: { checkpointId: "organizer" } });
    expect(server.issueTeamCode).toHaveBeenLastCalledWith({ marker: "team-codes" }, { uid: "u1", role: "admin" });
  });

  it("takes nothing from the client: the action has no input", () => {
    expect(issueTeamCodeAction.length).toBe(0);
  });

  it("says the screen's words for a refusal, such as an attendee asking for a team code", async () => {
    guards.getSession.mockResolvedValue(session("attendee"));
    server.issueTeamCode.mockReturnValue({ ok: false, error: { code: "forbidden" } });
    expect(await issueTeamCodeAction()).toEqual({ ok: false, code: "forbidden" });

    server.issueTeamCode.mockReturnValue({ ok: false, error: { code: "unknown" } });
    expect(await issueTeamCodeAction()).toEqual({ ok: false, code: "unknown" });
  });

  it("refuses when check-ins are switched off or without a session, before issuing anything", async () => {
    features.FEATURES.checkins = false;
    expect(await issueTeamCodeAction()).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
    features.FEATURES.checkins = true;

    guards.getSession.mockResolvedValue(null);
    expect(await issueTeamCodeAction()).toEqual({ ok: false, code: "unauthenticated" });
    expect(server.issueTeamCode).not.toHaveBeenCalled();
  });
});
