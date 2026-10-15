import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/network.server", () => ({ networkDeps: { marker: "network" } }));
vi.mock("@/app-shell/NetworkScreen", () => ({ NetworkScreen: () => null }));

const guards = { requireAttendee: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { getNetwork: vi.fn() };
vi.mock("@/features/network/server", () => server);

class Redirected extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

const features = vi.hoisted(() => ({ FEATURES: { network: true, achievements: true } }));
vi.mock("@/shared/config/features", () => features);

const { NetworkScreen } = await import("@/app-shell/NetworkScreen");
const { default: NetworkPage } = await import("./page");

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

const NO_LINKS = { linkedin: null, github: null, web: null };
const OVERVIEW = {
  me: { alias: "Ana", squad: "Firebase", links: NO_LINKS },
  contacts: [{ id: "p1", alias: "Bruno", squad: null, links: NO_LINKS, connectedAt: new Date("2026-10-24T15:00:00Z") }],
  reward: { xp: 20, credits: 5, cap: 10 },
};

describe("Red page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.network = true;
    features.FEATURES.achievements = true;
    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    server.getNetwork.mockResolvedValue({ ok: true, value: OVERVIEW });
  });

  it("does not exist while the network is switched off", async () => {
    features.FEATURES.network = false;

    await expect(NetworkPage()).rejects.toThrow("not-found");
    expect(guards.requireAttendee).not.toHaveBeenCalled();
  });

  it("reads the network of the cadet of the session and hands it over as plain data", async () => {
    const screen = findElement(await NetworkPage(), NetworkScreen);

    expect(server.getNetwork).toHaveBeenCalledWith({ marker: "network" }, { uid: "u1", role: "attendee" });
    expect(screen?.props).toEqual({
      me: OVERVIEW.me,
      contacts: [{ id: "p1", alias: "Bruno", squad: null, links: NO_LINKS }],
      reward: OVERVIEW.reward,
      achievementsHref: "/achievements",
    });
  });

  it("links badges to Logros only while achievements are on", async () => {
    features.FEATURES.achievements = false;

    expect(findElement(await NetworkPage(), NetworkScreen)?.props.achievementsHref).toBeUndefined();
  });

  it("sends an attendee without a profile in this edition to onboarding, and surfaces other failures", async () => {
    server.getNetwork.mockResolvedValue({ ok: false, error: { code: "not-registered" } });
    await expect(NetworkPage()).rejects.toThrow(Redirected);

    server.getNetwork.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    await expect(NetworkPage()).rejects.toThrow("Could not read the cadet network");
  });
});
