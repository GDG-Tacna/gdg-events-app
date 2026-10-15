import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/ScannerScreen", () => ({ ScannerScreen: () => null }));

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

const { ScannerScreen } = await import("@/app-shell/ScannerScreen");
const { default: ScanPage } = await import("./page");

function findElement(node: ReactNode, type: unknown): unknown {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as { type: unknown; props: { children?: ReactNode } };
  if (element.type === type) return element;
  return findElement(element.props.children, type);
}

describe("scan page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.checkins = true;
    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
  });

  it("is only for attendees: the attendee guard sends visitors to login and staff and admin to their own home", async () => {
    await ScanPage();

    expect(guards.requireAttendee).toHaveBeenCalledTimes(1);
  });

  it("lets the guard's redirect or not-found reach the router untouched", async () => {
    guards.requireAttendee.mockRejectedValue(new NotFound("staff"));

    await expect(ScanPage()).rejects.toBeInstanceOf(NotFound);
  });

  it("is not found when check-ins are switched off, without reading the session", async () => {
    features.FEATURES.checkins = false;

    await expect(ScanPage()).rejects.toBeInstanceOf(NotFound);
    expect(guards.requireAttendee).not.toHaveBeenCalled();
  });

  it("shows the scanner", async () => {
    const tree = await ScanPage();

    expect(findElement(tree, ScannerScreen)).not.toBeNull();
  });
});
