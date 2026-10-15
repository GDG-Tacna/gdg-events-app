import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));
vi.mock("@/features/auth", () => ({ SignOutButton: () => null }));

const features = vi.hoisted(() => ({ FEATURES: { checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { StaffShell } = await import("@/app-shell/StaffShell");
const { default: StaffLayout, metadata } = await import("./layout");

const props = (children: ReactNode) => ({ children }) as unknown as Parameters<typeof StaffLayout>[0];

describe("staff layout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.checkins = true;
    guards.requireRole.mockResolvedValue({ uid: "s1", role: "staff", displayName: "Bruno", photoUrl: null });
  });

  it("requires the staff role (the guard lets admins through too): attendees and visitors are stopped", async () => {
    await StaffLayout(props(<p>x</p>));

    expect(guards.requireRole).toHaveBeenCalledWith(["staff"]);
  });

  it("lets the guard's redirect or not-found reach the router untouched", async () => {
    guards.requireRole.mockRejectedValue(new NotFound("attendee"));

    await expect(StaffLayout(props(<p>x</p>))).rejects.toBeInstanceOf(NotFound);
  });

  it("is not found when check-ins are switched off, without reading the session", async () => {
    features.FEATURES.checkins = false;

    await expect(StaffLayout(props(<p>x</p>))).rejects.toBeInstanceOf(NotFound);
    expect(guards.requireRole).not.toHaveBeenCalled();
  });

  it("frames the page with the staff shell and the person's name", async () => {
    const child = <p>contenido</p>;

    const tree = await StaffLayout(props(child));

    expect(isValidElement(tree) && tree.type === StaffShell).toBe(true);
    const shell = tree as unknown as { props: Record<string, unknown> };
    expect(shell.props.account).toBe("Bruno");
    expect(shell.props.children).toBe(child);
  });

  it("is never indexed by search engines", () => {
    expect(metadata.robots).toEqual({ index: false });
  });
});
