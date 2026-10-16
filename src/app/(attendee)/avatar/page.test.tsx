import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/avatar.server", () => ({ avatarDeps: { marker: "avatars" } }));
vi.mock("@/app-shell/composition/dashboard.server", () => ({ dashboardDeps: { marker: "dashboard" } }));
vi.mock("@/app-shell/avatar/avatar.actions", () => ({ saveAvatarAction: vi.fn(), resetAvatarAction: vi.fn() }));
const guards = { requireAttendee: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
class Redirected extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
const avatarServer = vi.hoisted(() => ({ getAvatarLook: vi.fn() }));
vi.mock("@/features/avatar/server", () => avatarServer);
const dashboard = vi.hoisted(() => ({ getAttendeeOverview: vi.fn() }));
vi.mock("@/features/dashboard", () => dashboard);

const { AvatarEditor } = await import("@/features/avatar");
const actions = await import("@/app-shell/avatar/avatar.actions");
const { default: AvatarPage } = await import("./page");

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

describe("avatar page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee" });
    dashboard.getAttendeeOverview.mockResolvedValue({ ok: true, value: { alias: "Nova_7" } });
    avatarServer.getAvatarLook.mockResolvedValue(null);
  });

  it("opens the editor with the cadet's alias and chosen look", async () => {
    const editor = findElement(await AvatarPage(), AvatarEditor);

    expect(editor?.props).toEqual({ alias: "Nova_7", chosen: null, save: actions.saveAvatarAction, reset: actions.resetAvatarAction, backHref: "/dashboard" });
    expect(avatarServer.getAvatarLook).toHaveBeenCalledWith({ marker: "avatars" }, "u1");
  });

  it("sends a cadet without a profile to onboarding, and surfaces a failed read", async () => {
    dashboard.getAttendeeOverview.mockResolvedValueOnce({ ok: true, value: null });
    await expect(AvatarPage()).rejects.toThrow(new Redirected("/onboarding"));
    dashboard.getAttendeeOverview.mockResolvedValueOnce({ ok: false, error: { code: "unknown" } });
    await expect(AvatarPage()).rejects.toThrow("Could not read the attendee profile");
  });
});
