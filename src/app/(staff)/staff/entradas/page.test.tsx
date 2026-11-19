import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/ChangeTicketScreenBound", () => ({ ChangeTicketScreenBound: () => null }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const permissions = vi.hoisted(() => ({ staffStations: vi.fn(), staffCheckpoints: vi.fn() }));
vi.mock("@/app-shell/permissions.server", () => permissions);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const features = vi.hoisted(() => ({ FEATURES: { checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { ChangeTicketScreenBound } = await import("@/app-shell/ChangeTicketScreenBound");
const { default: StaffTicketsPage } = await import("./page");

function contains(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => contains(child, type));
  if (!isValidElement(node)) return false;
  const element = node as { type: unknown; props: { children?: ReactNode } };
  return element.type === type || contains(element.props.children, type);
}

describe("staff change ticket page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.checkins = true;
    guards.requireRole.mockResolvedValue({ uid: "s1", role: "staff", displayName: null, photoUrl: null });
    permissions.staffStations.mockResolvedValue(["entrance", "catering", "stand"]);
    permissions.staffCheckpoints.mockResolvedValue(undefined);
  });

  it("shows the screen that scans a cadet and changes their ticket", async () => {
    expect(contains(await StaffTicketsPage(), ChangeTicketScreenBound)).toBe(true);
    expect(guards.requireRole).toHaveBeenCalledWith(["staff"]);
  });

  it("is not found with check-ins off, without reading the session", async () => {
    features.FEATURES.checkins = false;

    await expect(StaffTicketsPage()).rejects.toBeInstanceOf(NotFound);
    expect(guards.requireRole).not.toHaveBeenCalled();
  });

  it("is not found for staff with no station to operate, and lets an admin in without asking", async () => {
    permissions.staffStations.mockResolvedValue([]);
    await expect(StaffTicketsPage()).rejects.toBeInstanceOf(NotFound);

    permissions.staffStations.mockResolvedValue(["stand"]);
    permissions.staffCheckpoints.mockResolvedValue([]);
    await expect(StaffTicketsPage()).rejects.toBeInstanceOf(NotFound);

    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    expect(contains(await StaffTicketsPage(), ChangeTicketScreenBound)).toBe(true);
  });

  it("lets the guard's redirect reach the router untouched", async () => {
    guards.requireRole.mockRejectedValue(new Error("redirect:/login"));

    await expect(StaffTicketsPage()).rejects.toThrow("redirect:/login");
  });
});
