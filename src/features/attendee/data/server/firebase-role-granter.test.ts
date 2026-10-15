import type { Auth } from "firebase-admin/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminAuth: () => { throw new Error("must be injected"); } }));

const { FirebaseRoleGranter } = await import("./firebase-role-granter");

const auth = { getUser: vi.fn(), setCustomUserClaims: vi.fn() };
const granter = new FirebaseRoleGranter(() => auth as unknown as Auth);

describe("FirebaseRoleGranter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets the attendee role claim for a user without a role", async () => {
    auth.getUser.mockResolvedValue({ customClaims: undefined });

    expect(await granter.grantAttendeeRole("u1")).toEqual({ ok: true, value: undefined });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("u1", { role: "attendee" });
  });

  it("keeps the other claims of the user", async () => {
    auth.getUser.mockResolvedValue({ customClaims: { beta: true } });

    await granter.grantAttendeeRole("u1");

    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("u1", { beta: true, role: "attendee" });
  });

  it.each(["attendee", "admin"])("does nothing when the user already is %s (idempotent, never downgrades an admin)", async (role) => {
    auth.getUser.mockResolvedValue({ customClaims: { role } });

    expect(await granter.grantAttendeeRole("u1")).toEqual({ ok: true, value: undefined });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it.each(["staff", "organizer"])("replaces a %s claim from another edition (only reached when this edition's team does not list them)", async (role) => {
    auth.getUser.mockResolvedValue({ customClaims: { role, other: "kept" } });

    expect(await granter.grantAttendeeRole("u1")).toEqual({ ok: true, value: undefined });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("u1", { role: "attendee", other: "kept" });
  });

  it("reports a provider failure as unknown", async () => {
    auth.getUser.mockRejectedValue(new Error("boom"));

    expect(await granter.grantAttendeeRole("u1")).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
