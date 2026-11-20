import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const cadetsDepsAccounts = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/app-shell/composition/cadets.server", () => ({ cadetsDeps: { marker: "cadets", accounts: cadetsDepsAccounts } }));
vi.mock("@/app-shell/composition/squads.server", () => ({ squadStore: { list: async () => squads.list() } }));
const teamRoles = vi.hoisted(() => ({ roleOf: vi.fn(), listTeam: vi.fn() }));
vi.mock("@/app-shell/composition/admin.server", () => ({ teamDeps: { marker: "team", team: { roleOf: teamRoles.roleOf } } }));
vi.mock("@/features/admin/server", () => ({ listTeam: teamRoles.listTeam }));
vi.mock("@/app-shell/admin/team.actions", () => ({ grantRoleAction: async () => ({ ok: true }), revokeRoleAction: async () => ({ ok: true }) }));
const speakers = vi.hoisted(() => ({ speakerLinksOf: vi.fn() }));
vi.mock("@/features/speakers/server", () => speakers);
vi.mock("@/app-shell/composition/speakers.server", () => ({ speakerAccessDeps: { marker: "speaker-access" } }));
vi.mock("@/app-shell/speakers/access.actions", () => ({ linkSpeakerAccountAction: async () => ({ ok: true }), unlinkSpeakerAction: async () => ({ ok: true }) }));
vi.mock("@/app-shell/tickets/tickets.actions", () => ({ changeCadetTicketAction: async () => ({ ok: true }) }));
vi.mock("@/app-shell/cadets/manage.actions", () => ({
  renameCadetAction: async () => ({ ok: true }),
  changeCadetSquadAction: async () => ({ ok: true }),
  banCadetAction: async () => ({ ok: true }),
  unbanCadetAction: async () => ({ ok: true }),
  deleteCadetAction: async () => ({ ok: true }),
}));

const squads = vi.hoisted(() => ({ list: vi.fn() }));
const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const permissions = vi.hoisted(() => ({ requireSection: vi.fn(), mayEdit: vi.fn<(session: unknown, section: unknown) => Promise<boolean>>(async () => true) }));
vi.mock("@/app-shell/permissions.server", () => permissions);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const server = vi.hoisted(() => ({ CADETS_SEARCH_MAX: 80, CADETS_SEARCH_MIN: 2, listCadets: vi.fn(), getCadet: vi.fn() }));
vi.mock("@/features/cadets/server", () => server);

const { CadetDetailView, CadetsListView } = await import("@/features/cadets");
const actions = await import("@/app-shell/cadets/manage.actions");
const tickets = await import("@/app-shell/tickets/tickets.actions");
const teamActions = await import("@/app-shell/admin/team.actions");
const speakerActions = await import("@/app-shell/speakers/access.actions");
const { default: AdminCadetsPage } = await import("./page");
const { default: AdminCadetPage } = await import("./[uid]/page");

function findElement(node: ReactNode, type: unknown): { props: Record<string, unknown> } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as { type: unknown; props: Record<string, unknown> };
  if (element.type === type) return element;
  return findElement(element.props.children as ReactNode, type);
}

const SESSION = { uid: "a1", role: "admin", adminScope: "edition", displayName: null, photoUrl: null };
const AT = new Date("2026-11-20T10:00:00Z");
const CADET = {
  uid: "cadet-0001",
  alias: "Nova",
  squad: "firebase",
  xp: 120,
  credits: 30,
  createdAt: AT,
  attendedAt: AT,
  banned: false,
  ticket: "premium",
  activity: { checkIns: 1, missions: 0, badges: 0, contacts: 0 },
  bannedAt: null,
  banReason: null,
  ticketSource: "list",
  ticketSetBy: null,
  ticketSetAt: null,
};
const page = (params: Record<string, string | string[]> = {}) => AdminCadetsPage({ searchParams: Promise.resolve(params) } as never);
const detail = (uid = "cadet-0001") => AdminCadetPage({ params: Promise.resolve({ uid }) } as never);

beforeEach(() => {
  vi.resetAllMocks();
  guards.requireRole.mockResolvedValue(SESSION);
  permissions.mayEdit.mockResolvedValue(true);
  squads.list.mockResolvedValue({ ok: true, value: [{ id: "firebase", name: "Firebase" }] });
  teamRoles.listTeam.mockResolvedValue({ ok: true, value: [] });
  teamRoles.roleOf.mockResolvedValue({ ok: true, value: null });
  speakers.speakerLinksOf.mockResolvedValue({ ok: true, value: { linked: null, available: [{ id: "ana", name: "Ana Torres" }] } });
});

describe("admin cadets list page", () => {
  beforeEach(() => {
    server.listCadets.mockResolvedValue({ ok: true, value: { cadets: [{ ...CADET, identity: { email: "nova@example.com", displayName: "Nova Real" } }], next: "nova", total: 40 } });
  });

  it("checks the admin role and the section itself before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new NotFound("not-found"));
    await expect(page()).rejects.toBeInstanceOf(NotFound);
    expect(server.listCadets).not.toHaveBeenCalled();

    guards.requireRole.mockResolvedValue(SESSION);
    permissions.requireSection.mockRejectedValue(new NotFound("hidden"));
    await expect(page()).rejects.toBeInstanceOf(NotFound);
    expect(permissions.requireSection).toHaveBeenCalledWith(SESSION, "cadets");
  });

  it("lists the cadets as plain rows with their squad's name, with a link to the next page", async () => {
    const view = findElement(await page({ q: "no" }), CadetsListView);

    expect(server.listCadets).toHaveBeenCalledWith({ marker: "cadets", accounts: cadetsDepsAccounts }, { uid: "a1", role: "admin" }, { search: "no", after: null });
    expect(view?.props).toEqual({
      cadets: [{ uid: "cadet-0001", alias: "Nova", name: "Nova Real", email: "nova@example.com", squadName: "Firebase", xp: 120, credits: 30, attended: true, banned: false, ticket: "premium", teamRole: null }],
      total: 40,
      search: "no",
      nextHref: "/admin/cadetes?q=no&despues=nova",
      hrefs: { list: "/admin/cadetes", detailBase: "/admin/cadetes", tickets: "/admin/cadetes/entradas" },
    });
  });

  it("treats a search of one letter as no search: lists everyone and keeps it out of the next link", async () => {
    const view = findElement(await page({ q: " n " }), CadetsListView);

    expect(server.listCadets).toHaveBeenCalledWith({ marker: "cadets", accounts: cadetsDepsAccounts }, { uid: "a1", role: "admin" }, { search: "", after: null });
    expect(view?.props.search).toBe("");
    expect(view?.props.nextHref).toBe("/admin/cadetes?despues=nova");
  });

  it("marks the cadets who hold a role in the team, and lists them without marks when the team cannot be read", async () => {
    teamRoles.listTeam.mockResolvedValue({ ok: true, value: [{ uid: "cadet-0001", email: "nova@example.com", displayName: "Nova", role: "staff" }] });
    const marked = findElement(await page(), CadetsListView);
    expect((marked?.props.cadets as Array<{ teamRole: string | null }>)[0].teamRole).toBe("staff");
    expect(teamRoles.listTeam).toHaveBeenCalledWith({ marker: "team", team: expect.anything() }, { uid: "a1", role: "admin", adminScope: "edition" });

    teamRoles.listTeam.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    const plain = findElement(await page(), CadetsListView);
    expect((plain?.props.cadets as Array<{ teamRole: string | null }>)[0].teamRole).toBeNull();
  });

  it("reads the page after the cursor in the address, and links no next page at the end", async () => {
    server.listCadets.mockResolvedValue({ ok: true, value: { cadets: [CADET], next: null, total: 1 } });

    const view = findElement(await page({ despues: "mia" }), CadetsListView);

    expect(server.listCadets).toHaveBeenCalledWith({ marker: "cadets", accounts: cadetsDepsAccounts }, { uid: "a1", role: "admin" }, { search: "", after: "mia" });
    expect(view?.props.nextHref).toBeNull();
  });

  it("still lists the cadets by their squad's id when the squads cannot be read", async () => {
    squads.list.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    const view = findElement(await page(), CadetsListView);

    expect((view?.props.cadets as Array<{ squadName: string }>)[0].squadName).toBe("firebase");
  });

  it("surfaces a failed read through the error boundary", async () => {
    server.listCadets.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(page()).rejects.toThrow("Could not read the cadets");
  });
});

describe("admin cadet page", () => {
  beforeEach(() => {
    server.getCadet.mockResolvedValue({ ok: true, value: { cadet: CADET, account: { email: "nova@example.com", displayName: "Nova", role: "attendee", disabled: false } } });
  });

  it("hands the view the cadet as plain data, the actions, and what the session may do", async () => {
    const view = findElement(await detail(), CadetDetailView);

    expect(server.getCadet).toHaveBeenCalledWith({ marker: "cadets", accounts: cadetsDepsAccounts }, { uid: "a1", role: "admin" }, { uid: "cadet-0001" });
    expect(view?.props).toMatchObject({
      cadet: {
        uid: "cadet-0001",
        alias: "Nova",
        squad: "firebase",
        squadName: "Firebase",
        createdAt: AT.toISOString(),
        attendedAt: AT.toISOString(),
        account: { email: "nova@example.com", displayName: "Nova", disabled: false },
      },
      squads: [{ id: "firebase", name: "Firebase" }],
      rename: actions.renameCadetAction,
      changeSquad: actions.changeCadetSquadAction,
      changeTicket: tickets.changeCadetTicketAction,
      ban: actions.banCadetAction,
      unban: actions.unbanCadetAction,
      remove: actions.deleteCadetAction,
      canDelete: false,
      canEdit: true,
      isSelf: false,
      listHref: "/admin/cadetes",
    });
  });

  it("gives the view the controls for the team role: the one they hold, what the session may give, and the Equipo actions", async () => {
    teamRoles.roleOf.mockResolvedValue({ ok: true, value: "staff" });

    const view = findElement(await detail(), CadetDetailView);

    expect(teamRoles.roleOf).toHaveBeenCalledWith("cadet-0001");
    expect(permissions.mayEdit).toHaveBeenCalledWith(SESSION, "team");
    expect(view?.props.team).toEqual({ role: "staff", assignable: ["staff"], give: teamActions.grantRoleAction, take: teamActions.revokeRoleAction });

    guards.requireRole.mockResolvedValue({ ...SESSION, adminScope: "global" });
    expect(findElement(await detail(), CadetDetailView)?.props.team).toMatchObject({ assignable: ["staff", "organizer", "admin"] });
  });

  it("gives the view the speaker link: who they are, who is free, and the Speakers actions, with the talks permission", async () => {
    const view = findElement(await detail(), CadetDetailView);

    expect(speakers.speakerLinksOf).toHaveBeenCalledWith({ marker: "speaker-access" }, { role: "admin" }, "cadet-0001");
    expect(permissions.mayEdit).toHaveBeenCalledWith(SESSION, "talks");
    expect(view?.props.speaker).toEqual({ linked: null, available: [{ id: "ana", name: "Ana Torres" }], link: speakerActions.linkSpeakerAccountAction, unlink: speakerActions.unlinkSpeakerAction });
  });

  it("offers no speaker link without the talks permission, nor when the speakers could not be read", async () => {
    permissions.mayEdit.mockImplementation(async (_session, section) => section !== "talks");
    expect(findElement(await detail(), CadetDetailView)?.props.speaker).toBeUndefined();

    permissions.mayEdit.mockResolvedValue(true);
    speakers.speakerLinksOf.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(findElement(await detail(), CadetDetailView)?.props.speaker).toBeUndefined();
  });

  it("offers no team role to a session without the team permission, nor when their role could not be read", async () => {
    permissions.mayEdit.mockImplementation(async (_session, section) => section !== "team");
    expect(findElement(await detail(), CadetDetailView)?.props.team).toBeUndefined();

    permissions.mayEdit.mockResolvedValue(true);
    teamRoles.roleOf.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(findElement(await detail(), CadetDetailView)?.props.team).toBeUndefined();
  });

  it("hands the view the ticket and where it came from, with the name of whoever set it by hand", async () => {
    server.getCadet.mockResolvedValue({
      ok: true,
      value: { cadet: { ...CADET, ticket: "premium", ticketSource: "manual", ticketSetBy: "staff-0001" }, account: null },
    });
    (cadetsDepsAccounts.lookup as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, value: { email: "luis@example.com", displayName: "Luis Staff", role: "staff", disabled: false } });

    const view = findElement(await detail(), CadetDetailView);

    expect(cadetsDepsAccounts.lookup).toHaveBeenCalledWith("staff-0001");
    expect(view?.props.cadet).toMatchObject({ ticket: "premium", ticketSource: "manual", ticketSetByName: "Luis Staff" });
  });

  it("does not look anyone up for a ticket that came from the list, and leaves the name out when the account cannot be read", async () => {
    await detail();
    expect(cadetsDepsAccounts.lookup).not.toHaveBeenCalled();

    server.getCadet.mockResolvedValue({ ok: true, value: { cadet: { ...CADET, ticketSource: "manual", ticketSetBy: "staff-0001" }, account: null } });
    (cadetsDepsAccounts.lookup as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(findElement(await detail(), CadetDetailView)?.props.cadet).toMatchObject({ ticketSetByName: null });
  });

  it("lets only an admin of every edition delete, and marks the session's own cadet", async () => {
    guards.requireRole.mockResolvedValue({ ...SESSION, adminScope: "global", uid: "cadet-0001" });

    const view = findElement(await detail(), CadetDetailView);

    expect(view?.props).toMatchObject({ canDelete: true, isSelf: true });
  });

  it("shows the page read-only to a session that may not edit cadets", async () => {
    permissions.mayEdit.mockResolvedValue(false);

    expect(findElement(await detail(), CadetDetailView)?.props.canEdit).toBe(false);
    expect(permissions.mayEdit).toHaveBeenCalledWith(SESSION, "cadets");
  });

  it("copes with no account and a squad the edition no longer lists", async () => {
    server.getCadet.mockResolvedValue({ ok: true, value: { cadet: { ...CADET, squad: "retirado", createdAt: null, attendedAt: null }, account: null } });

    const view = findElement(await detail(), CadetDetailView);

    expect(view?.props.cadet).toMatchObject({ squadName: "retirado", createdAt: null, attendedAt: null, account: null, attended: false });
  });

  it("is not found for an unknown cadet, and surfaces any other failure", async () => {
    server.getCadet.mockResolvedValue({ ok: false, error: { code: "not-found" } });
    await expect(detail("ghost-0001")).rejects.toBeInstanceOf(NotFound);

    server.getCadet.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    await expect(detail()).rejects.toThrow("Could not read the cadet");
  });
});
