import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/team-code/code.action", () => ({ issueTeamCodeAction: async () => ({ ok: false, code: "unknown" }) }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const features = vi.hoisted(() => ({ FEATURES: { checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { TeamCodeScreen } = await import("@/app-shell/team-code/TeamCodeScreen");
const { ButtonLink } = await import("@/shared/ui");
const { copy } = await import("@/shared/copy/es");
const { default: TeamCodePage } = await import("./page");

function findAll(node: ReactNode, type: unknown, found: Array<{ props: Record<string, unknown> }> = []): Array<{ props: Record<string, unknown> }> {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, type, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  const element = node as { type: unknown; props: Record<string, unknown> };
  if (element.type === type) found.push(element);
  return findAll(element.props.children as ReactNode, type, found);
}

const session = (role: "staff" | "admin" | "attendee") => ({ uid: "s1", role, displayName: null, photoUrl: null });

describe("«Mi código» page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.checkins = true;
    guards.requireRole.mockResolvedValue(session("staff"));
  });

  it("checks the staff role itself (admins may enter too) before showing anything", async () => {
    await TeamCodePage();

    expect(guards.requireRole).toHaveBeenCalledWith(["staff"]);
  });

  it("shows the volunteer's code to staff, with a way back to their puestos", async () => {
    const tree = await TeamCodePage();

    expect(findAll(tree, TeamCodeScreen)[0].props).toEqual({ role: "volunteer" });
    expect(findAll(tree, ButtonLink)[0].props).toMatchObject({ href: "/staff", children: copy.teamCode.back });
  });

  it("shows the organizer's code to an admin, with a way back to the control center", async () => {
    guards.requireRole.mockResolvedValue(session("admin"));

    const tree = await TeamCodePage();

    expect(findAll(tree, TeamCodeScreen)[0].props).toEqual({ role: "organizer" });
    expect(findAll(tree, ButtonLink)[0].props).toMatchObject({ href: "/admin" });
  });

  it("is not found for a role that has no team code, or with check-ins off", async () => {
    guards.requireRole.mockResolvedValue(session("attendee"));
    await expect(TeamCodePage()).rejects.toBeInstanceOf(NotFound);

    features.FEATURES.checkins = false;
    await expect(TeamCodePage()).rejects.toBeInstanceOf(NotFound);
  });
});
