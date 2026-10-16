import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/quadrants.server", () => ({ galaxyDeps: { marker: "galaxy" } }));
vi.mock("@/app-shell/composition/talks.server", () => ({ agendaDeps: { marker: "agenda" } }));

const guards = { requireAttendee: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const features = vi.hoisted(() => ({ FEATURES: { map: true, checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const server = { getGalaxyMap: vi.fn() };
vi.mock("@/features/quadrants/server", () => server);
const talksServer = { getAgenda: vi.fn() };
vi.mock("@/features/talks/server", () => talksServer);

const { default: Link } = await import("next/link");
const { VenueMapView } = await import("@/features/quadrants");
const { AgendaView } = await import("@/features/talks");
const { copy } = await import("@/shared/copy/es");
const { default: MapPage } = await import("./page");

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
const findElement = (node: ReactNode, type: unknown) => findAll(node, type)[0] ?? null;

const GALAXY = { venue: { width: 100, height: 140, areas: [] }, quadrants: [{ id: "auditorio", name: "Auditorio", extra: 1 }] };
const ITEMS = [{ id: "keynote", title: "Keynote", speaker: "Ana", startsAt: null, endsAt: null, roomId: "auditorio", description: "", status: "later", attended: true }];
const page = (vista?: string) => MapPage({ searchParams: Promise.resolve(vista ? { vista } : {}) } as never);

describe("map page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.map = true;
    features.FEATURES.checkins = true;
    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    server.getGalaxyMap.mockResolvedValue({ ok: true, value: GALAXY });
    talksServer.getAgenda.mockResolvedValue({ ok: true, value: ITEMS });
  });

  it("checks the attendee before reading the map, and lets the guard's redirect through", async () => {
    guards.requireAttendee.mockRejectedValue(new NotFound("staff"));

    await expect(page()).rejects.toBeInstanceOf(NotFound);
    expect(server.getGalaxyMap).not.toHaveBeenCalled();
  });

  it("is only the agenda when the map is switched off: no plan and no views to choose", async () => {
    features.FEATURES.map = false;

    const tree = await page();
    expect(findElement(tree, AgendaView)).not.toBeNull();
    expect(findElement(tree, VenueMapView)).toBeNull();
    expect(findAll(tree, Link)).toHaveLength(0);
    features.FEATURES.map = true;
  });

  it("is not found when the map and check-ins are both off, without reading the session", async () => {
    features.FEATURES.map = false;
    features.FEATURES.checkins = false;

    await expect(page()).rejects.toBeInstanceOf(NotFound);
    expect(guards.requireAttendee).not.toHaveBeenCalled();
    features.FEATURES.map = true;
    features.FEATURES.checkins = true;
  });

  it("shows the edition's galaxy map by default, without reading the agenda", async () => {
    const tree = await page();

    expect(server.getGalaxyMap).toHaveBeenCalledWith({ marker: "galaxy" });
    expect(findElement(tree, VenueMapView)?.props).toEqual({ galaxy: GALAXY });
    expect(findElement(tree, AgendaView)).toBeNull();
    expect(talksServer.getAgenda).not.toHaveBeenCalled();
  });

  it("offers the plan and the agenda as two views, marking the one on screen", async () => {
    const links = findAll(await page(), Link);

    expect(links.map((link) => [link.props.href, link.props.children, link.props["aria-current"]])).toEqual([
      ["/map", copy.map.views.plan, "page"],
      ["/map?vista=agenda", copy.map.views.agenda, undefined],
    ]);
    const onAgenda = findAll(await page("agenda"), Link);
    expect(onAgenda.map((link) => link.props["aria-current"])).toEqual([undefined, "page"]);
  });

  it("shows the cadet's agenda with the quadrants as rooms", async () => {
    const tree = await page("agenda");

    expect(talksServer.getAgenda).toHaveBeenCalledWith({ marker: "agenda" }, "u1");
    expect(findElement(tree, AgendaView)?.props).toEqual({ items: ITEMS, rooms: [{ id: "auditorio", name: "Auditorio" }] });
    expect(findElement(tree, VenueMapView)).toBeNull();
  });

  it("shows only the plan, with no views to choose, when check-ins are off", async () => {
    features.FEATURES.checkins = false;
    const tree = await page("agenda");

    expect(findElement(tree, VenueMapView)).not.toBeNull();
    expect(findAll(tree, Link)).toEqual([]);
    expect(talksServer.getAgenda).not.toHaveBeenCalled();
  });

  it("treats an unknown view as the plan", async () => {
    expect(findElement(await page("otra"), VenueMapView)).not.toBeNull();
  });

  it("surfaces a failed read through the error boundary", async () => {
    server.getGalaxyMap.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    await expect(page()).rejects.toThrow("Could not read the galaxy map");

    server.getGalaxyMap.mockResolvedValue({ ok: true, value: GALAXY });
    talksServer.getAgenda.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    await expect(page("agenda")).rejects.toThrow("Could not read the agenda");
  });
});
