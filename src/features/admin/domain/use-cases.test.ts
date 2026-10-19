import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import type { AuditLog, RoleDirectory, TeamRepository } from "./ports";
import type { Account, ManagedRole, TeamMember } from "./team";
import { teamError, type TeamError } from "./team-error";
import { grantRole, listTeam, revokeRole, type Actor, type TeamDeps } from "./use-cases";

const NOW = new Date("2026-10-20T14:00:00Z");
const ADMIN: Actor = { uid: "admin-1", role: "admin" };
const ana: Account = { uid: "u-ana", email: "ana@example.com", displayName: "Ana" };

interface Setup {
  account?: Account | null;
  findError?: TeamError;
  previous?: ManagedRole | null;
  changeError?: TeamError;
  claimError?: TeamError;
  auditError?: TeamError;
  members?: readonly TeamMember[];
  /** The person's records in the team of every edition, as they stand after the change. */
  elsewhere?: ReadonlyArray<{ eventId: string; role: "staff" | "organizer" }>;
  rolesError?: TeamError;
}

function setup({
  account = ana,
  findError,
  previous = null,
  changeError,
  claimError,
  auditError,
  members = [],
  elsewhere = [],
  rolesError,
}: Setup = {}) {
  const directory: RoleDirectory = {
    findByEmail: vi.fn(async (): Promise<Result<Account | null, TeamError>> => (findError ? err(findError) : ok(account))),
    setRole: vi.fn(async () => (claimError ? err(claimError) : ok(undefined))),
  };
  const team: TeamRepository = {
    list: vi.fn(async () => ok(members)),
    roleOf: vi.fn(async () => ok(previous)),
    editionRoleOf: vi.fn(async () => ok(null)),
    editionRolesOf: vi.fn(async () => (rolesError ? err(rolesError) : ok(elsewhere))),
    change: vi.fn(async () => (changeError ? err(changeError) : ok({ previous }))),
  };
  const audit: AuditLog = { append: vi.fn(async () => (auditError ? err(auditError) : ok(undefined))) };
  const deps: TeamDeps = { directory, team, audit, now: () => NOW };
  return { deps, directory, team, audit };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("grantRole", () => {
  it("gives the role to the account with that email, in the team record, the claim and the audit trail", async () => {
    const t = setup();

    const result = await grantRole(t.deps, ADMIN, { email: "ana@example.com", role: "staff" });

    expect(result).toEqual(ok({ uid: "u-ana", email: "ana@example.com", displayName: "Ana", role: "staff" }));
    expect(t.team.change).toHaveBeenCalledWith(ana, "staff");
    expect(t.directory.setRole).toHaveBeenCalledWith("u-ana", "staff");
    expect(t.audit.append).toHaveBeenCalledWith({
      action: "role.granted",
      actorUid: "admin-1",
      targetUid: "u-ana",
      details: { role: "staff", previous: null },
      at: NOW,
    });
  });

  it("matches the email without caring about case or surrounding spaces", async () => {
    const t = setup();

    await grantRole(t.deps, ADMIN, { email: "  ANA@Example.COM ", role: "admin" });

    expect(t.directory.findByEmail).toHaveBeenCalledWith("ana@example.com");
  });

  it.each([
    [{ uid: "u1", role: "staff" }],
    [{ uid: "u1", role: "attendee" }],
    [{ uid: "u1", role: null }],
  ] as const)("refuses an actor that is not an admin (%j) before touching anything", async (actor) => {
    const t = setup();

    const result = await grantRole(t.deps, actor, { email: "ana@example.com", role: "admin" });

    expect(result).toEqual(err(teamError("forbidden")));
    expect(t.directory.findByEmail).not.toHaveBeenCalled();
    expect(t.team.change).not.toHaveBeenCalled();
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it.each(["", "not-an-email", "a@b", "two words@x.com", `${"a".repeat(250)}@x.com`])(
    "rejects %j as an email",
    async (email) => {
      const t = setup();

      expect(await grantRole(t.deps, ADMIN, { email, role: "staff" })).toEqual(err(teamError("invalid-email")));
      expect(t.directory.findByEmail).not.toHaveBeenCalled();
    },
  );

  it("says so when nobody has signed in with that email", async () => {
    const t = setup({ account: null });

    expect(await grantRole(t.deps, ADMIN, { email: "ghost@example.com", role: "staff" })).toEqual(
      err(teamError("user-not-found")),
    );
    expect(t.team.change).not.toHaveBeenCalled();
  });

  it("does not let an admin change their own role", async () => {
    const t = setup({ account: { uid: "admin-1", email: "me@example.com", displayName: null } });

    expect(await grantRole(t.deps, ADMIN, { email: "me@example.com", role: "staff" })).toEqual(
      err(teamError("cannot-change-self")),
    );
    expect(t.team.change).not.toHaveBeenCalled();
  });

  it("stops before the claim when the change would remove the last admin", async () => {
    const t = setup({ previous: "admin", changeError: teamError("last-admin") });

    expect(await grantRole(t.deps, ADMIN, { email: "ana@example.com", role: "staff" })).toEqual(
      err(teamError("last-admin")),
    );
    expect(t.directory.setRole).not.toHaveBeenCalled();
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("is a no-op when the person already has that role: no claim write, no audit noise", async () => {
    const t = setup({ previous: "staff" });

    const result = await grantRole(t.deps, ADMIN, { email: "ana@example.com", role: "staff" });

    expect(result).toMatchObject({ ok: true, value: { role: "staff" } });
    expect(t.directory.setRole).not.toHaveBeenCalled();
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("puts the team record back when the claim cannot be written", async () => {
    const t = setup({ previous: "staff", claimError: teamError("unknown") });

    const result = await grantRole(t.deps, ADMIN, { email: "ana@example.com", role: "admin" });

    expect(result).toEqual(err(teamError("unknown")));
    expect(t.team.change).toHaveBeenNthCalledWith(1, ana, "admin");
    expect(t.team.change).toHaveBeenNthCalledWith(2, ana, "staff");
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("keeps a change that already happened when only the audit write fails, and says so in the log", async () => {
    const t = setup({ auditError: teamError("unknown") });

    const result = await grantRole(t.deps, ADMIN, { email: "ana@example.com", role: "staff" });

    expect(result).toMatchObject({ ok: true });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("admin.audit.append"));
  });

  it("passes identity provider failures through", async () => {
    const t = setup({ findError: teamError("unknown") });

    expect(await grantRole(t.deps, ADMIN, { email: "ana@example.com", role: "staff" })).toEqual(
      err(teamError("unknown")),
    );
  });
});

describe("revokeRole", () => {
  it("clears the role and audits it as revoked", async () => {
    const t = setup({ previous: "staff" });

    const result = await revokeRole(t.deps, ADMIN, { email: "ana@example.com" });

    expect(result).toEqual(ok(null));
    expect(t.team.change).toHaveBeenCalledWith(ana, null);
    expect(t.directory.setRole).toHaveBeenCalledWith("u-ana", null);
    expect(t.audit.append).toHaveBeenCalledWith({
      action: "role.revoked",
      actorUid: "admin-1",
      targetUid: "u-ana",
      details: { role: null, previous: "staff" },
      at: NOW,
    });
  });

  it("leaves a plain attendee alone: their attendee claim must not be cleared", async () => {
    const t = setup({ previous: null });

    const result = await revokeRole(t.deps, ADMIN, { email: "ana@example.com" });

    expect(result).toEqual(ok(null));
    expect(t.directory.setRole).not.toHaveBeenCalled();
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("refuses to remove the last admin", async () => {
    const t = setup({ previous: "admin", changeError: teamError("last-admin") });

    expect(await revokeRole(t.deps, ADMIN, { email: "ana@example.com" })).toEqual(err(teamError("last-admin")));
    expect(t.directory.setRole).not.toHaveBeenCalled();
  });

  it("refuses a non-admin actor", async () => {
    const t = setup();

    expect(await revokeRole(t.deps, { uid: "s1", role: "staff" }, { email: "ana@example.com" })).toEqual(
      err(teamError("forbidden")),
    );
    expect(t.team.change).not.toHaveBeenCalled();
  });
});

describe("an organizer (admin of one edition)", () => {
  const ORGANIZER: Actor = { uid: "org-1", role: "admin", adminScope: "edition" };

  it("adds staff and removes staff", async () => {
    expect((await grantRole(setup().deps, ORGANIZER, { email: "ana@example.com", role: "staff" })).ok).toBe(true);
    expect((await revokeRole(setup({ previous: "staff" }).deps, ORGANIZER, { email: "ana@example.com" })).ok).toBe(true);
  });

  it.each([
    ["names an organizer", null, "organizer"],
    ["names an admin", null, "admin"],
    ["turns staff into an organizer", "staff", "organizer"],
    ["turns an organizer into staff", "organizer", "staff"],
    ["removes an organizer", "organizer", null],
    ["removes an admin", "admin", null],
  ] as const)("cannot do what is not staff: %s", async (_, previous, role) => {
    const t = setup({ previous });

    const result = role === null ? await revokeRole(t.deps, ORGANIZER, { email: "ana@example.com" }) : await grantRole(t.deps, ORGANIZER, { email: "ana@example.com", role });

    expect(result).toEqual(err(teamError("forbidden")));
    expect(t.team.change).not.toHaveBeenCalled();
    expect(t.directory.setRole).not.toHaveBeenCalled();
  });

  it("lets a global admin name organizers", async () => {
    expect((await grantRole(setup().deps, { ...ADMIN, adminScope: "global" }, { email: "ana@example.com", role: "organizer" })).ok).toBe(true);
  });

  it("never demotes an organizer of another edition when adding them as staff here: their claim and session stay", async () => {
    const t = setup({ account: { ...ana, claim: "organizer" }, elsewhere: [{ eventId: "devfest-2027", role: "organizer" }] });

    const result = await grantRole(t.deps, ORGANIZER, { email: "ana@example.com", role: "staff" });

    expect(result.ok).toBe(true);
    expect(t.team.change).toHaveBeenCalledWith({ ...ana, claim: "organizer" }, "staff");
    expect(t.directory.setRole).not.toHaveBeenCalled();
  });

  it("never strips the claim of someone who is still staff or organizer in another edition when removing them here", async () => {
    const staffElsewhere = setup({ previous: "staff", account: { ...ana, claim: "staff" }, elsewhere: [{ eventId: "devfest-2027", role: "staff" }] });
    const organizerElsewhere = setup({ previous: "staff", account: { ...ana, claim: "organizer" }, elsewhere: [{ eventId: "devfest-2027", role: "organizer" }] });

    expect((await revokeRole(staffElsewhere.deps, ORGANIZER, { email: "ana@example.com" })).ok).toBe(true);
    expect((await revokeRole(organizerElsewhere.deps, ORGANIZER, { email: "ana@example.com" })).ok).toBe(true);

    expect(staffElsewhere.directory.setRole).not.toHaveBeenCalled();
    expect(organizerElsewhere.directory.setRole).not.toHaveBeenCalled();
  });
});

describe("the role claim", () => {
  it("is the strongest role the person keeps in any edition", async () => {
    const t = setup({ previous: "organizer", account: { ...ana, claim: "organizer" }, elsewhere: [{ eventId: "devfest-2025", role: "staff" }] });

    await revokeRole(t.deps, ADMIN, { email: "ana@example.com" });

    expect(t.directory.setRole).toHaveBeenCalledWith("u-ana", "staff");
  });

  it("is cleared only when no edition keeps them", async () => {
    const t = setup({ previous: "staff", account: { ...ana, claim: "staff" } });

    await revokeRole(t.deps, ADMIN, { email: "ana@example.com" });

    expect(t.directory.setRole).toHaveBeenCalledWith("u-ana", null);
  });

  it("puts the team record back when the other editions cannot be read", async () => {
    const t = setup({ rolesError: teamError("unknown") });

    const result = await grantRole(t.deps, ADMIN, { email: "ana@example.com", role: "staff" });

    expect(result).toEqual(err(teamError("unknown")));
    expect(t.directory.setRole).not.toHaveBeenCalled();
    expect(t.team.change).toHaveBeenLastCalledWith(ana, null);
  });
});

describe("listTeam", () => {
  const members: TeamMember[] = [{ uid: "u1", email: "a@x.com", displayName: null, role: "admin" }];

  it("returns the team to an admin", async () => {
    const t = setup({ members });

    expect(await listTeam(t.deps, ADMIN)).toEqual(ok(members));
  });

  it("does not show the team to anyone else", async () => {
    const t = setup({ members });

    expect(await listTeam(t.deps, { uid: "s1", role: "staff" })).toEqual(err(teamError("forbidden")));
    expect(t.team.list).not.toHaveBeenCalled();
  });
});
