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

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const adminServer = { listTeam: vi.fn(), listInvites: vi.fn() };
vi.mock("@/features/admin/server", () => adminServer);

const { TeamView } = await import("@/features/admin");
const { grantRoleAction, revokeRoleAction } = await import("@/app-shell/admin/team.actions");
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
