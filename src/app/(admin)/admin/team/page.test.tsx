import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/admin.server", () => ({ teamDeps: { marker: "deps" }, inviteDeps: () => ({ marker: "invites" }) }));
vi.mock("@/app-shell/admin/invite.actions", () => ({ createInviteAction: async () => ({ ok: true }), revokeInviteAction: async () => ({ ok: true }) }));
vi.mock("@/app-shell/admin/team.actions", () => ({
  grantRoleAction: async () => ({ ok: true, member: null }),
  revokeRoleAction: async () => ({ ok: true, member: null }),
}));

vi.mock("@/app-shell/composition/edition.server", () => ({ currentEditionId: async () => "devfest-2026" }));
vi.mock("@/app-shell/composition/checkpoint-admin.server", () => ({ checkpointAdminDeps: { marker: "checkpoints" }, staffScopeDeps: { marker: "scopes" } }));
vi.mock("@/app-shell/admin/staff-scope.action", () => ({ setStaffScopeAction: async () => ({ ok: true, checkpointIds: null }) }));

const checkpointsServer = vi.hoisted(() => ({
  STATION_KINDS: ["entrance", "catering", "stand"],
  isStationKind: (kind: string) => ["entrance", "catering", "stand"].includes(kind),
  listCheckpoints: vi.fn(),
  listStaffScopes: vi.fn(),
}));
vi.mock("@/features/checkpoints/server", () => checkpointsServer);

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const adminServer = { listTeam: vi.fn(), listInvites: vi.fn() };
vi.mock("@/features/admin/server", () => adminServer);

const { TeamView } = await import("@/features/admin");
const { grantRoleAction, revokeRoleAction } = await import("@/app-shell/admin/team.actions");
const { setStaffScopeAction } = await import("@/app-shell/admin/staff-scope.action");
const permissions = await import("@/app-shell/permissions.server");
const { default: AdminTeamPage } = await import("./page");

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

const MEMBERS = [{ uid: "a1", email: "ana@example.com", displayName: "Ana", role: "admin" as const }];

describe("admin team page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", adminScope: "global", displayName: "Ana", photoUrl: null });
    adminServer.listTeam.mockResolvedValue({ ok: true, value: MEMBERS });
    adminServer.listInvites.mockResolvedValue({ ok: true, value: [] });
    checkpointsServer.listStaffScopes.mockResolvedValue({ ok: true, value: { s1: ["stand-louis"] } });
    checkpointsServer.listCheckpoints.mockResolvedValue({
      ok: true,
      value: [
        { id: "talk-keynote", kind: "talk", name: "Keynote", active: true },
        { id: "stand-louis", kind: "stand", name: "Stand Louis 3D", active: true },
        { id: "almuerzo", kind: "catering", name: "Almuerzo", active: false },
        { id: "entrada-norte", kind: "entrance", name: "Entrada norte", active: true },
      ],
    });
  });

  it("checks the admin role itself, because the layout does not run again on every navigation", async () => {
    await AdminTeamPage();

    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
  });

  it("reads the team as the verified session's admin and hands it, with the actions, to the view", async () => {
    const tree = await AdminTeamPage();

    expect(adminServer.listTeam).toHaveBeenCalledWith({ marker: "deps" }, { uid: "a1", role: "admin", adminScope: "global" });
    const view = findElement(tree, TeamView);
    expect(view?.props).toMatchObject({
      members: MEMBERS,
      currentUid: "a1",
      grant: grantRoleAction,
      revoke: revokeRoleAction,
      eventId: "devfest-2026",
    });
  });

  it("hands the view each staff member's stations and the edition's stations to choose from, grouped by kind and never a talk", async () => {
    const tree = await AdminTeamPage();

    expect(checkpointsServer.listStaffScopes).toHaveBeenCalledWith({ marker: "scopes" }, { uid: "a1", role: "admin", adminScope: "global" });
    expect(findElement(tree, TeamView)?.props).toMatchObject({
      staffScopes: { s1: ["stand-louis"] },
      stations: [
        { id: "entrada-norte", kind: "entrance", name: "Entrada norte", active: true },
        { id: "almuerzo", kind: "catering", name: "Almuerzo", active: false },
        { id: "stand-louis", kind: "stand", name: "Stand Louis 3D", active: true },
      ],
      setScope: setStaffScopeAction,
    });
  });

  it("lets a viewer who may not edit the team see the stations but not change them", async () => {
    vi.spyOn(permissions, "mayEdit").mockResolvedValueOnce(false);

    const tree = await AdminTeamPage();

    expect(findElement(tree, TeamView)?.props.setScope).toBeUndefined();
  });

  it("surfaces a failed read of the stations instead of showing everyone as unlimited", async () => {
    checkpointsServer.listStaffScopes.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminTeamPage()).rejects.toThrow("Could not read the staff's stations");
  });

  it("does not read anything when the guard stops the request", async () => {
    guards.requireRole.mockRejectedValue(new Error("redirected"));

    await expect(AdminTeamPage()).rejects.toThrow("redirected");
    expect(adminServer.listTeam).not.toHaveBeenCalled();
  });

  it("surfaces a failed read through the error boundary instead of showing an empty team", async () => {
    adminServer.listTeam.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminTeamPage()).rejects.toThrow("Could not read the team");
  });
});
