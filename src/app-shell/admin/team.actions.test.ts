import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/admin.server", () => ({ teamDeps: { marker: "deps" } }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const adminServer = { grantRole: vi.fn(), revokeRole: vi.fn() };
vi.mock("@/features/admin/server", () => adminServer);

const features = vi.hoisted(() => ({ FEATURES: { admin: true } }));
vi.mock("@/shared/config/features", () => features);

const { grantRoleAction, revokeRoleAction } = await import("./team.actions");

const session = (role: "attendee" | "staff" | "admin" | null, adminScope?: "global" | "edition") => ({ uid: "admin-1", role, displayName: null, photoUrl: null, ...(role === "admin" ? { adminScope: adminScope ?? "global" } : {}) });

describe.each([
  ["grantRoleAction", () => grantRoleAction({ email: "ana@example.com", role: "staff" }), adminServer.grantRole],
  ["revokeRoleAction", () => revokeRoleAction({ email: "ana@example.com" }), adminServer.revokeRole],
] as const)("%s", (_name, call, useCase) => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(session("admin"));
  });

  it("does nothing when the admin area is switched off", async () => {
    features.FEATURES.admin = false;

    expect(await call()).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
    expect(useCase).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    guards.getSession.mockResolvedValue(null);

    expect(await call()).toEqual({ ok: false, code: "unauthenticated" });
    expect(useCase).not.toHaveBeenCalled();
  });

  it.each(["attendee", "staff", null] as const)("refuses a %s session", async (role) => {
    guards.getSession.mockResolvedValue(session(role));

    expect(await call()).toEqual({ ok: false, code: "forbidden" });
    expect(useCase).not.toHaveBeenCalled();
  });

  it("takes the actor from the session and returns plain data", async () => {
    useCase.mockResolvedValue({ ok: true, value: null });

    expect(await call()).toEqual({ ok: true, member: null });
    expect(useCase.mock.calls[0][0]).toEqual({ marker: "deps" });
    expect(useCase.mock.calls[0][1]).toEqual({ uid: "admin-1", role: "admin", adminScope: "global" });
  });

  it("passes an organizer's edition scope, and assumes the narrower scope when it is missing", async () => {
    useCase.mockResolvedValue({ ok: true, value: null });

    guards.getSession.mockResolvedValue(session("admin", "edition"));
    await call();
    expect(useCase.mock.calls[0][1]).toEqual({ uid: "admin-1", role: "admin", adminScope: "edition" });

    guards.getSession.mockResolvedValue({ uid: "admin-1", role: "admin", displayName: null, photoUrl: null });
    await call();
    expect(useCase.mock.calls[1][1]).toMatchObject({ adminScope: "edition" });
  });

  it("maps a use case failure to its code only", async () => {
    useCase.mockResolvedValue({ ok: false, error: { code: "last-admin" } });

    expect(await call()).toEqual({ ok: false, code: "last-admin" });
  });
});

describe("input validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(session("admin"));
  });

  it("refuses a role that cannot be managed (attendee, or anything invented)", async () => {
    for (const role of ["attendee", "root", "", undefined as unknown as string]) {
      expect(await grantRoleAction({ email: "ana@example.com", role })).toEqual({ ok: false, code: "invalid-email" });
    }
    expect(adminServer.grantRole).not.toHaveBeenCalled();
  });

  it("refuses an email that is not text or is absurdly long", async () => {
    expect(await revokeRoleAction({ email: 5 as unknown as string })).toEqual({ ok: false, code: "invalid-email" });
    expect(await revokeRoleAction({ email: "a".repeat(300) })).toEqual({ ok: false, code: "invalid-email" });
    expect(adminServer.revokeRole).not.toHaveBeenCalled();
  });
});
