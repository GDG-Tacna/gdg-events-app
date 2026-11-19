import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/pass/issue-pass.action", () => ({ issuePassAction: async () => ({ ok: false, code: "unknown" }) }));

vi.mock("@/app-shell/composition/attendee.server", () => ({ attendeeDeps: { marker: "attendee" } }));
const attendeeServer = vi.hoisted(() => ({ getAttendee: vi.fn() }));
vi.mock("@/features/attendee/server", () => attendeeServer);

const guards = { requireAttendee: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const features = vi.hoisted(() => ({ FEATURES: { checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { PassDisplay } = await import("@/features/pass");
const { issuePassAction } = await import("@/app-shell/pass/issue-pass.action");
const { default: PassPage } = await import("./page");

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

describe("pass page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.checkins = true;
    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    attendeeServer.getAttendee.mockResolvedValue({ ok: true, value: { ticket: { type: "premium", source: "list" } } });
  });

  it("is only for attendees: the attendee guard decides who gets in", async () => {
    await PassPage();

    expect(guards.requireAttendee).toHaveBeenCalledTimes(1);
  });

  it("lets the guard's redirect reach the router untouched", async () => {
    guards.requireAttendee.mockRejectedValue(new Error("redirect:/staff"));

    await expect(PassPage()).rejects.toThrow("redirect:/staff");
  });

  it("is not found when check-ins are switched off, without reading the session", async () => {
    features.FEATURES.checkins = false;

    await expect(PassPage()).rejects.toBeInstanceOf(NotFound);
    expect(guards.requireAttendee).not.toHaveBeenCalled();
  });

  it("shows the pass, bound to the action that issues it for the signed-in attendee", async () => {
    const tree = await PassPage();

    expect(findElement(tree, PassDisplay)?.props.issue).toBe(issuePassAction);
  });

  it("shows the cadet's ticket under the code, and still shows the pass when it cannot be read", async () => {
    expect(findElement(await PassPage(), PassDisplay)?.props.ticket).toBe("premium");
    expect(attendeeServer.getAttendee).toHaveBeenCalledWith({ marker: "attendee" }, "u1");

    attendeeServer.getAttendee.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(findElement(await PassPage(), PassDisplay)?.props.ticket).toBeNull();
  });
});
