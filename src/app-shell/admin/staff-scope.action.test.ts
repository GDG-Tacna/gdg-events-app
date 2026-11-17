import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/checkpoint-admin.server", () => ({ staffScopeDeps: { marker: "deps" } }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const permissions = vi.hoisted(() => ({ mayEdit: vi.fn<(session: unknown, section: unknown) => Promise<boolean>>(async () => true) }));
vi.mock("@/app-shell/permissions.server", () => permissions);

const checkpointsServer = vi.hoisted(() => ({ STAFF_SCOPE_MAX: 50, setStaffScope: vi.fn() }));
vi.mock("@/features/checkpoints/server", () => checkpointsServer);

const features = vi.hoisted(() => ({ FEATURES: { admin: true } }));
vi.mock("@/shared/config/features", () => features);

const { setStaffScopeAction } = await import("./staff-scope.action");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "admin-1", role, displayName: null, photoUrl: null });

describe("setStaffScopeAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(session("admin"));
    permissions.mayEdit.mockResolvedValue(true);
    checkpointsServer.setStaffScope.mockResolvedValue({ ok: true, value: ["stand-louis"] });
  });

  it("does nothing when the admin area is switched off", async () => {
    features.FEATURES.admin = false;

    expect(await setStaffScopeAction({ uid: "s1", checkpointIds: null })).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller, anyone but an admin, and an admin who may not edit the team", async () => {
    guards.getSession.mockResolvedValueOnce(null);
    expect(await setStaffScopeAction({ uid: "s1", checkpointIds: null })).toEqual({ ok: false, code: "unauthenticated" });

    guards.getSession.mockResolvedValueOnce(session("staff"));
    expect(await setStaffScopeAction({ uid: "s1", checkpointIds: null })).toEqual({ ok: false, code: "forbidden" });

    permissions.mayEdit.mockResolvedValueOnce(false);
    expect(await setStaffScopeAction({ uid: "s1", checkpointIds: null })).toEqual({ ok: false, code: "forbidden" });
    expect(permissions.mayEdit).toHaveBeenCalledWith(session("admin"), "team");
    expect(checkpointsServer.setStaffScope).not.toHaveBeenCalled();
  });

  it.each([
    { uid: "", checkpointIds: null },
    { uid: "s1", checkpointIds: ["x".repeat(49)] },
    { uid: "s1", checkpointIds: Array.from({ length: 51 }, (_, n) => `stand-${n}`) },
    { uid: "s1", checkpointIds: "stand-louis" as unknown as string[] },
  ])("rejects an input that cannot be a choice (%j) without touching the use case", async (input) => {
    expect(await setStaffScopeAction(input)).toEqual({ ok: false, code: "invalid-scope" });
    expect(checkpointsServer.setStaffScope).not.toHaveBeenCalled();
  });

  it("takes the actor from the session and answers the stations saved", async () => {
    expect(await setStaffScopeAction({ uid: "s1", checkpointIds: ["stand-louis"] })).toEqual({ ok: true, checkpointIds: ["stand-louis"] });
    expect(checkpointsServer.setStaffScope).toHaveBeenCalledWith({ marker: "deps" }, { uid: "admin-1", role: "admin" }, { uid: "s1", checkpointIds: ["stand-louis"] });
  });

  it("maps a use case failure to its code only", async () => {
    checkpointsServer.setStaffScope.mockResolvedValue({ ok: false, error: { code: "invalid-scope" } });

    expect(await setStaffScopeAction({ uid: "s1", checkpointIds: ["talk-1"] })).toEqual({ ok: false, code: "invalid-scope" });
  });
});
