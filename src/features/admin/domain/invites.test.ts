import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { INVITE_TTL_MS, acceptInvite, createInvite, inviteState, listInvites, maskEmail, previewInvite, revokeInvite, splitInviteToken, type Invite, type InviteDeps } from "./invites";
import type { Actor } from "./use-cases";

const NOW = new Date("2026-10-20T12:00:00Z");
const SECRET = "s".repeat(43);
const ADMIN: Actor = { uid: "admin-1", role: "admin", adminScope: "global" };
const ORGANIZER: Actor = { uid: "org-1", role: "admin", adminScope: "edition" };
const SESSION = { uid: "u-ana", verifiedEmail: "ana@example.com", displayName: "Ana", role: null };

function setup(stored: Invite[] = []) {
  const rows = new Map(stored.map((invite) => [invite.id, invite]));
  const deps: InviteDeps = {
    invites: {
      list: vi.fn(async () => ok([...rows.values()])),
      create: vi.fn(async (invite: Invite) => (rows.set(invite.id, invite), ok(undefined))),
      get: vi.fn(async (id: string) => ok(rows.get(id) ?? null)),
      accept: vi.fn(async (id: string, uid: string, at: Date) => {
        const invite = rows.get(id);
        if (!invite || invite.acceptedAt) return ok(false);
        rows.set(id, { ...invite, acceptedAt: at, acceptedBy: uid });
        return ok(true);
      }),
      undoAccept: vi.fn(async (id: string) => (rows.set(id, { ...rows.get(id)!, acceptedAt: null, acceptedBy: null }), ok(undefined))),
      revoke: vi.fn(async (id: string, at: Date) => {
        const invite = rows.get(id);
        if (!invite) return ok(null);
        rows.set(id, { ...invite, revokedAt: at });
        return ok(rows.get(id)!);
      }),
    },
    team: {
      list: vi.fn(),
      roleOf: vi.fn(),
      editionRoleOf: vi.fn(),
      editionRolesOf: vi.fn(async () => ok([])),
      change: vi.fn(async () => ok({ previous: null })),
    },
    directory: { findByEmail: vi.fn(), setRole: vi.fn(async () => ok(undefined)) },
    audit: { append: vi.fn(async () => ok(undefined)) },
    newSecret: () => SECRET,
    hash: (secret) => `hash-of-${secret}`,
    appUrl: null,
    editionId: async () => "meetup-nov",
    mailer: null,
    now: () => NOW,
  };
  return { deps, rows };
}

const invite = (overrides: Partial<Invite> = {}): Invite => ({
  id: `hash-of-${SECRET}`,
  email: "ana@example.com",
  role: "staff",
  invitedBy: "admin-1",
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + INVITE_TTL_MS),
  acceptedAt: null,
  acceptedBy: null,
  revokedAt: null,
  ...overrides,
});

describe("createInvite", () => {
  it("stores only the hash of a new link, valid 7 days, and answers the link's path once", async () => {
    const { deps, rows } = setup();

    const created = await createInvite(deps, ADMIN, { email: "  Ana@Example.com ", role: "organizer" });

    expect(created).toEqual(ok({ invite: expect.objectContaining({ id: `hash-of-${SECRET}`, email: "ana@example.com", role: "organizer" }), path: `/invite/meetup-nov.${SECRET}`, emailed: false }));
    expect(rows.get(`hash-of-${SECRET}`)?.expiresAt).toEqual(new Date("2026-10-27T12:00:00Z"));
    expect(JSON.stringify([...rows.values()])).not.toContain(`"${SECRET}"`);
    expect(deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "invite.created", details: { role: "organizer", emailed: "false" } }));
  });

  it("emails the full link when a mailer and the app's address are set, and keeps the invitation if the email fails", async () => {
    const { deps } = setup();
    const send = vi.fn(async () => ok(undefined));
    const withMail = { ...deps, appUrl: "https://arcade.example", mailer: { send } };

    expect(await createInvite(withMail, ADMIN, { email: "ana@example.com", role: "staff" })).toMatchObject({ ok: true, value: { emailed: true } });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@example.com", role: "staff", link: `https://arcade.example/invite/meetup-nov.${SECRET}` }));

    vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockResolvedValueOnce(err({ code: "x" }) as never);
    const second = setup();
    expect(await createInvite({ ...second.deps, appUrl: "https://arcade.example", mailer: { send } }, ADMIN, { email: "ana@example.com", role: "staff" })).toMatchObject({ ok: true, value: { emailed: false } });
  });

  it("lets an organizer invite staff only, and refuses a bad email or role", async () => {
    const { deps } = setup();

    expect((await createInvite(deps, ORGANIZER, { email: "ana@example.com", role: "staff" })).ok).toBe(true);
    expect(await createInvite(setup().deps, ORGANIZER, { email: "ana@example.com", role: "organizer" })).toEqual(err({ code: "forbidden" }));
    expect(await createInvite(setup().deps, ORGANIZER, { email: "ana@example.com", role: "admin" })).toEqual(err({ code: "forbidden" }));
    expect(await createInvite(setup().deps, { uid: "s", role: "staff" }, { email: "ana@example.com", role: "staff" })).toEqual(err({ code: "forbidden" }));
    expect(await createInvite(setup().deps, ADMIN, { email: "no-es-correo", role: "staff" })).toEqual(err({ code: "invalid-email" }));
    expect(await createInvite(setup().deps, ADMIN, { email: "ana@example.com", role: "root" })).toEqual(err({ code: "invalid-role" }));
  });
});

describe("listInvites and revokeInvite", () => {
  it("shows an organizer only staff invitations", async () => {
    const { deps } = setup([invite({ id: "a" }), invite({ id: "b", role: "organizer" })]);

    expect((await listInvites(deps, ADMIN)).ok && (await listInvites(deps, ADMIN))).toMatchObject({ value: [{ id: "a" }, { id: "b" }] });
    expect(await listInvites(deps, ORGANIZER)).toMatchObject({ ok: true, value: [{ id: "a" }] });
    expect(await listInvites(deps, { uid: "s", role: "staff" })).toEqual(err({ code: "forbidden" }));
  });

  it("revokes a pending invitation, never one that is used or outside the organizer's reach", async () => {
    const { deps, rows } = setup([invite({ id: "a" }), invite({ id: "b", acceptedAt: NOW }), invite({ id: "c", role: "admin" })]);

    expect((await revokeInvite(deps, ADMIN, { id: "a" })).ok).toBe(true);
    expect(rows.get("a")?.revokedAt).toEqual(NOW);
    expect(await revokeInvite(deps, ADMIN, { id: "b" })).toEqual(err({ code: "used" }));
    expect(await revokeInvite(deps, ORGANIZER, { id: "c" })).toEqual(err({ code: "forbidden" }));
    expect(await revokeInvite(deps, ADMIN, { id: "zz" })).toEqual(err({ code: "not-found" }));
  });
});

describe("previewInvite", () => {
  it("shows the role, the email half hidden and the state", async () => {
    const { deps } = setup([invite()]);

    expect(await previewInvite(deps, SECRET)).toEqual(ok({ role: "staff", email: "an•••@example.com", state: "pending" }));
    expect(await previewInvite(deps, "short")).toEqual(err({ code: "not-found" }));
    expect(maskEmail("x@y.z")).toBe("x•••@y.z");
  });
});

describe("acceptInvite", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup([invite({ role: "organizer" })]);
  });

  it("gives the role with the invited, verified account: once, filed in the team, without signing the person out", async () => {
    expect(await acceptInvite(ctx.deps, SESSION, SECRET)).toEqual(ok({ role: "organizer" }));

    expect(ctx.deps.team.change).toHaveBeenCalledWith({ uid: "u-ana", email: "ana@example.com", displayName: "Ana" }, "organizer");
    expect(ctx.deps.directory.setRole).toHaveBeenCalledWith("u-ana", "organizer", { keepSession: true });
    expect(ctx.rows.get(`hash-of-${SECRET}`)).toMatchObject({ acceptedAt: NOW, acceptedBy: "u-ana" });
    expect(await acceptInvite(ctx.deps, SESSION, SECRET)).toEqual(err({ code: "used" }));
  });

  it("refuses another account, an unverified email, and an admin taking a lesser role", async () => {
    expect(await acceptInvite(ctx.deps, { ...SESSION, verifiedEmail: "otra@example.com" }, SECRET)).toEqual(err({ code: "wrong-account" }));
    expect(await acceptInvite(ctx.deps, { ...SESSION, verifiedEmail: null }, SECRET)).toEqual(err({ code: "unverified-email" }));
    expect(await acceptInvite(ctx.deps, { ...SESSION, role: "admin" }, SECRET)).toEqual(err({ code: "already-admin" }));
    expect(ctx.deps.directory.setRole).not.toHaveBeenCalled();
  });

  it("refuses an expired, revoked or unknown link", async () => {
    expect(await acceptInvite(setup([invite({ expiresAt: NOW })]).deps, SESSION, SECRET)).toEqual(err({ code: "expired" }));
    expect(await acceptInvite(setup([invite({ revokedAt: NOW })]).deps, SESSION, SECRET)).toEqual(err({ code: "revoked" }));
    expect(await acceptInvite(ctx.deps, SESSION, "t".repeat(43))).toEqual(err({ code: "not-found" }));
    expect(await acceptInvite(ctx.deps, SESSION, "../../x")).toEqual(err({ code: "not-found" }));
  });

  it("puts everything back when the role cannot be set: the team record and the link work again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(ctx.deps.directory.setRole).mockResolvedValueOnce(err({ code: "unknown" }));

    expect(await acceptInvite(ctx.deps, SESSION, SECRET)).toEqual(err({ code: "unknown" }));
    expect(ctx.deps.team.change).toHaveBeenLastCalledWith(expect.objectContaining({ uid: "u-ana" }), null);
    expect(inviteState(ctx.rows.get(`hash-of-${SECRET}`)!, NOW)).toBe("pending");
  });

  it("answers used when someone else accepted it at the same moment", async () => {
    vi.mocked(ctx.deps.invites.accept).mockResolvedValueOnce(ok(false));

    expect(await acceptInvite(ctx.deps, SESSION, SECRET)).toEqual(err({ code: "used" }));
    expect(ctx.deps.team.change).not.toHaveBeenCalled();
  });

describe("splitInviteToken", () => {
  it("reads the edition and secret of a link, and an older link as the public edition's", () => {
    expect(splitInviteToken(`meetup-nov.${SECRET}`)).toEqual({ eventId: "meetup-nov", secret: SECRET });
    expect(splitInviteToken(SECRET)).toEqual({ eventId: null, secret: SECRET });
  });

  it("refuses anything that is not a link", () => {
    expect(splitInviteToken(`Not An Edition.${SECRET}`)).toBeNull();
    expect(splitInviteToken("meetup-nov.short")).toBeNull();
    expect(splitInviteToken("short")).toBeNull();
    expect(splitInviteToken(`a.b.${SECRET}`)).toBeNull();
  });
});
});
