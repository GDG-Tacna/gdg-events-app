import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/odyssey.server", () => ({ odysseyDeps: { marker: "odyssey" }, storyTitleSource: { marker: "title" } }));
vi.mock("@/app-shell/composition/quadrants.server", () => ({ galaxyDeps: { marker: "galaxy" } }));

const guards = { requireAttendee: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const features = vi.hoisted(() => ({ FEATURES: { odyssey: true } }));
vi.mock("@/shared/config/features", () => features);

const odysseyServer = { getOdyssey: vi.fn(), getStoryTitle: async (source: { marker: string }) => (source.marker === "title" ? "Odisea de Código" : null) };
vi.mock("@/features/odyssey/server", () => odysseyServer);
const quadrantsServer = { getGalaxyMap: vi.fn() };
vi.mock("@/features/quadrants/server", () => quadrantsServer);

const { OdysseyView } = await import("@/features/odyssey");
const { default: OdysseyPage } = await import("./page");

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

const LOG = { transmissions: [], open: 0, total: 0 };

describe("odyssey page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.odyssey = true;
    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    odysseyServer.getOdyssey.mockResolvedValue({ ok: true, value: LOG });
    quadrantsServer.getGalaxyMap.mockResolvedValue({ ok: true, value: { quadrants: [{ id: "ai", name: "AI", planet: "ai", tagline: "x", order: 0, active: true, stands: [] }] } });
  });

  it("is not found when the odyssey is off, and checks the attendee before reading", async () => {
    features.FEATURES.odyssey = false;
    await expect(OdysseyPage()).rejects.toBeInstanceOf(NotFound);
    expect(guards.requireAttendee).not.toHaveBeenCalled();

    features.FEATURES.odyssey = true;
    guards.requireAttendee.mockRejectedValue(new NotFound("staff"));
    await expect(OdysseyPage()).rejects.toBeInstanceOf(NotFound);
    expect(odysseyServer.getOdyssey).not.toHaveBeenCalled();
  });

  it("shows the attendee's own log with the quadrants and the way back", async () => {
    const view = findElement(await OdysseyPage(), OdysseyView);

    expect(odysseyServer.getOdyssey).toHaveBeenCalledWith({ marker: "odyssey" }, "u1");
    expect(view?.props).toEqual({ title: "Odisea de Código", log: LOG, quadrants: [{ id: "ai", name: "AI", planet: "ai" }], backHref: "/missions" });
  });

  it("still lists the transmissions without quadrants, and surfaces a failed read", async () => {
    quadrantsServer.getGalaxyMap.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(findElement(await OdysseyPage(), OdysseyView)?.props.quadrants).toEqual([]);

    odysseyServer.getOdyssey.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    await expect(OdysseyPage()).rejects.toThrow("Could not read the odyssey");
  });
});
