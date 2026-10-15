import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const composition = vi.hoisted(() => ({ inviteDeps: vi.fn(() => ({ marker: "deps" })), forgetEditionRole: vi.fn() }));
vi.mock("@/app-shell/composition/admin.server", () => composition);
const guards = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/app-shell/guards", () => guards);
const features = vi.hoisted(() => ({ FEATURES: { admin: true } }));
vi.mock("@/shared/config/features", () => features);
const server = vi.hoisted(() => ({ createInvite: vi.fn(), revokeInvite: vi.fn(), acceptInvite: vi.fn() }));
vi.mock("@/features/admin/server", async () => ({ ...server, splitInviteToken: (await import("@/features/admin/domain/invites")).splitInviteToken }));
const edition = vi.hoisted(() => ({ runInEdition: vi.fn(async (_eventId: string, work: () => Promise<unknown>) => work()) }));
vi.mock("@/features/event/server", () => edition);

const { acceptInviteAction, createInviteAction, revokeInviteAction } = await import("./invite.actions");

const admin = (adminScope?: "global" | "edition") => ({ uid: "a1", role: "admin", displayName: null, photoUrl: null, ...(adminScope ? { adminScope } : {}) });
const HASH = "a".repeat(64);

describe("invite actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    edition.runInEdition.mockImplementation(async (_eventId: string, work: () => Promise<unknown>) => work());
    features.FEATURES.admin = true;
    composition.inviteDeps.mockReturnValue({ marker: "deps" });
    guards.getSession.mockResolvedValue(admin("global"));
  });

  it("creates an invitation as the session's admin and answers the link path", async () => {
    server.createInvite.mockResolvedValue({ ok: true, value: { invite: { id: "h" }, path: "/invite/x", emailed: false } });

    expect(await createInviteAction({ email: "ana@example.com", role: "staff" })).toEqual({ ok: true, invite: { id: "h" }, path: "/invite/x", emailed: false });
    expect(server.createInvite).toHaveBeenCalledWith({ marker: "deps" }, { uid: "a1", role: "admin", adminScope: "global" }, { email: "ana@example.com", role: "staff" });
  });

  it("acts with the narrower scope when the session has none, and refuses non-admins", async () => {
    server.createInvite.mockResolvedValue({ ok: false, error: { code: "forbidden" } });
    guards.getSession.mockResolvedValue(admin());
    await createInviteAction({ email: "ana@example.com", role: "staff" });
    expect(server.createInvite.mock.calls[0][1]).toMatchObject({ adminScope: "edition" });

    guards.getSession.mockResolvedValue({ uid: "s1", role: "staff", displayName: null, photoUrl: null });
    expect(await createInviteAction({ email: "ana@example.com", role: "staff" })).toEqual({ ok: false, code: "forbidden" });
    guards.getSession.mockResolvedValue(null);
    expect(await revokeInviteAction({ id: HASH })).toEqual({ ok: false, code: "unauthenticated" });
  });

  it("checks the id's shape before revoking", async () => {
    server.revokeInvite.mockResolvedValue({ ok: true, value: {} });

    expect(await revokeInviteAction({ id: "../x" })).toEqual({ ok: false, code: "not-found" });
    expect(await revokeInviteAction({ id: HASH })).toEqual({ ok: true });
    expect(server.revokeInvite).toHaveBeenCalledTimes(1);
  });

  it("accepts with the signed-in account's verified email, and drops what this server kept of its role", async () => {
    server.acceptInvite.mockResolvedValue({ ok: true, value: { role: "staff" } });
    guards.getSession.mockResolvedValue({ uid: "u-ana", role: null, displayName: "Ana", photoUrl: null, verifiedEmail: "ana@example.com" });

    expect(await acceptInviteAction({ secret: "s".repeat(43) })).toEqual({ ok: true, role: "staff" });
    expect(server.acceptInvite).toHaveBeenCalledWith({ marker: "deps" }, { uid: "u-ana", verifiedEmail: "ana@example.com", displayName: "Ana", role: null }, "s".repeat(43));
    expect(composition.forgetEditionRole).toHaveBeenCalledWith("u-ana");
    expect(edition.runInEdition).not.toHaveBeenCalled();
  });

  it("accepts in the edition the link names, and refuses what is not a link", async () => {
    server.acceptInvite.mockResolvedValue({ ok: true, value: { role: "organizer" } });
    guards.getSession.mockResolvedValue({ uid: "u-ana", role: null, displayName: "Ana", photoUrl: null, verifiedEmail: "ana@example.com" });

    expect(await acceptInviteAction({ secret: `meetup-nov.${"s".repeat(43)}` })).toEqual({ ok: true, role: "organizer" });
    expect(edition.runInEdition).toHaveBeenCalledWith("meetup-nov", expect.any(Function));
    expect(server.acceptInvite).toHaveBeenCalledWith({ marker: "deps" }, expect.anything(), "s".repeat(43));

    expect(await acceptInviteAction({ secret: "no" })).toEqual({ ok: false, code: "not-found" });
  });

  it("needs a session to accept, and is off with the admin area", async () => {
    guards.getSession.mockResolvedValue(null);
    expect(await acceptInviteAction({ secret: "s".repeat(43) })).toEqual({ ok: false, code: "unauthenticated" });

    features.FEATURES.admin = false;
    expect(await acceptInviteAction({ secret: "s".repeat(43) })).toEqual({ ok: false, code: "disabled" });
    expect(await createInviteAction({ email: "a@b.c", role: "staff" })).toEqual({ ok: false, code: "disabled" });
  });
});
