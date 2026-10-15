import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
class Redirected extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(`redirect:${to}`);
  },
}));
vi.mock("@/app-shell/composition/event.server", () => ({ editionsDeps: { marker: "editions" } }));
vi.mock("@/app-shell/event/working-edition.actions", () => ({ chooseWorkingEditionAction: async () => ({ ok: true }) }));
const guards = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/app-shell/guards", () => guards);
const server = vi.hoisted(() => ({ listEditionChoices: vi.fn() }));
vi.mock("@/features/event/server", () => server);

const { MyEditionsView } = await import("@/features/event");
const { chooseWorkingEditionAction } = await import("@/app-shell/event/working-edition.actions");
const { default: MyEditionsPage } = await import("./page");

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

const DRAFT = { id: "meetup-nov", name: "Meetup", isPublic: false, stage: "draft" };

describe("my editions page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireSession.mockResolvedValue({ uid: "u1", role: null, displayName: null, photoUrl: null, otherEditions: [{ eventId: "meetup-nov", role: "organizer" }] });
    server.listEditionChoices.mockResolvedValue({ ok: true, value: [DRAFT] });
  });

  it("shows the editions where the person is in the team, with their role there", async () => {
    const view = findElement(await MyEditionsPage(), MyEditionsView);

    expect(server.listEditionChoices).toHaveBeenCalledWith({ marker: "editions" }, ["meetup-nov"]);
    expect(view?.props).toEqual({ entries: [{ edition: DRAFT, role: "organizer" }], choose: chooseWorkingEditionAction, adminHref: "/admin" });
  });

  it("sends anyone with a role here, or with no other edition, to their home", async () => {
    guards.requireSession.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    await expect(MyEditionsPage()).rejects.toThrow("/dashboard");

    guards.requireSession.mockResolvedValue({ uid: "u1", role: null, displayName: null, photoUrl: null });
    await expect(MyEditionsPage()).rejects.toThrow("/onboarding");
  });
});
