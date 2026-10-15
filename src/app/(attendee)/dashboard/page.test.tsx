import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/squads.server", () => ({ squadDeps: { catalog: { marker: "catalog" } } }));
const dashboardComposition = vi.hoisted(() => ({ dashboardDeps: { marker: "deps" }, openMissionsSummary: vi.fn() }));
vi.mock("@/app-shell/composition/dashboard.server", () => dashboardComposition);
const economyComposition = vi.hoisted(() => ({ squadCardDeps: { marker: "squad-credits" }, currentEconomy: vi.fn() }));
vi.mock("@/app-shell/composition/economy.server", () => economyComposition);
const economyServer = { getSquadStanding: vi.fn() };
vi.mock("@/features/economy/server", () => economyServer);
vi.mock("@/app-shell/composition/network.server", () => ({ networkStore: { marker: "network" } }));
const networkServer = { countContacts: vi.fn() };
vi.mock("@/app-shell/composition/leaderboard.server", () => ({ leaderboardDeps: { marker: "leaderboard" } }));
const leaderboardServer = { getCadetStanding: vi.fn() };
vi.mock("@/app-shell/composition/raffle.server", () => ({ raffleCardDeps: { marker: "raffle" } }));
const raffleServer = { getCadetTickets: vi.fn() };
vi.mock("@/features/raffle/server", () => raffleServer);
vi.mock("@/features/leaderboard/server", () => leaderboardServer);
vi.mock("@/features/network/server", () => networkServer);

const guards = { requireAttendee: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}
class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const dashboard = vi.hoisted(() => ({ getAttendeeOverview: vi.fn() }));
vi.mock("@/features/dashboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/dashboard")>()),
  getAttendeeOverview: dashboard.getAttendeeOverview,
}));

const squadsServer = { listSquads: vi.fn() };
vi.mock("@/features/squads/server", () => squadsServer);

const features = vi.hoisted(() => ({ FEATURES: { squads: true, checkins: true, network: true, leaderboard: true, raffle: true, missions: true } }));
vi.mock("@/shared/config/features", () => features);

const { DashboardView, MissionsCard } = await import("@/features/dashboard");
const { InstallHint } = await import("@/features/pwa");
const { PassCard } = await import("@/features/pass");
const { NetworkCard } = await import("@/features/network");
const { StandingCard } = await import("@/features/leaderboard");
const { RaffleTicketsCard } = await import("@/features/raffle");
const { SquadBadge } = await import("@/features/squads");
const { SquadCreditsCard, DEFAULT_ECONOMY } = await import("@/features/economy");
const { default: DashboardPage } = await import("./page");

const SPRITE = { rows: ["x"], palette: { x: "#ffffff" } };
const CATALOG = [
  { id: "angular", name: "Escuadrón Angular", tagline: "t", sprite: SPRITE, active: true },
  { id: "firebase", name: "Escuadrón Firebase", tagline: "t", sprite: SPRITE, active: true },
  { id: "gemini", name: "Escuadrón Gemini", tagline: "t", sprite: SPRITE, active: true },
];

const TICKETS = { tickets: 3, minCredits: 1, eligible: true, won: [] };
const STANDING_VALUE = { position: 2, xp: 120, total: 30, top: [] };
const STANDING = { wallet: { squadId: "firebase", balance: 40, earned: 50, spent: 10 }, prizes: [{ id: "polera", name: "Polera", description: "", cost: 100, stock: null, active: true, order: 0 }] };

const overviewOf = (squadId: string | null) => ({
  alias: "Nova_7",
  xp: 120,
  credits: 3,
  rank: { id: "pilot", level: 2 },
  nextRank: { id: "commander", level: 3, minXp: 500 },
  progressPercent: 5,
  squadId,
});

/** Finds the first element of a type in the tree that the page returns. */
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

async function renderPage() {
  const tree = await DashboardPage();
  const view = findElement(tree, DashboardView);
  if (!view) throw new Error("The page did not render a DashboardView");
  return view.props;
}

const target = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    if (error instanceof Redirected) return error.to;
    if (error instanceof NotFound) return "not-found";
    throw error;
  }
  return null;
};

describe("DashboardPage", () => {
  it("keeps a retired squad on its members' card but never offers it to someone without a squad", async () => {
    squadsServer.listSquads.mockResolvedValue({ ok: true, value: [CATALOG[0], { ...CATALOG[1], active: false }, CATALOG[2]] });

    dashboard.getAttendeeOverview.mockResolvedValue({ ok: true, value: overviewOf("firebase") });
    const member = await renderPage();
    expect((member.squadBadge as { props: { squad: { id: string } } }).props.squad.id).toBe("firebase");

    dashboard.getAttendeeOverview.mockResolvedValue({ ok: true, value: overviewOf(null) });
    const newcomer = await renderPage();
    expect((newcomer.squadPreviews as Array<{ id: string }>).map((squad) => squad.id)).toEqual(["angular", "gemini"]);
  });

  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.squads = true;
    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    squadsServer.listSquads.mockResolvedValue({ ok: true, value: CATALOG });
    dashboard.getAttendeeOverview.mockResolvedValue({ ok: true, value: overviewOf("firebase") });
    economyComposition.currentEconomy.mockResolvedValue(DEFAULT_ECONOMY);
    economyServer.getSquadStanding.mockResolvedValue({ ok: true, value: STANDING });
    features.FEATURES.network = true;
    networkServer.countContacts.mockResolvedValue({ ok: true, value: 3 });
    features.FEATURES.leaderboard = true;
    leaderboardServer.getCadetStanding.mockResolvedValue({ ok: true, value: STANDING_VALUE });
    features.FEATURES.raffle = true;
    raffleServer.getCadetTickets.mockResolvedValue({ ok: true, value: TICKETS });
  });

  it("only serves attendees: the attendee guard decides who gets in (staff and admin are sent to their own home)", async () => {
    await renderPage();

    expect(guards.requireAttendee).toHaveBeenCalledTimes(1);
    expect(dashboard.getAttendeeOverview).toHaveBeenCalledWith(expect.anything(), "u1");
  });

  it("sends an attendee without a profile to onboarding", async () => {
    dashboard.getAttendeeOverview.mockResolvedValue({ ok: true, value: null });

    expect(await target(DashboardPage)).toBe("/onboarding");
  });

  it("lets the guard's redirect (a staff or admin going home, a visitor going to login) reach the router untouched", async () => {
    guards.requireAttendee.mockRejectedValue(new Redirected("/admin"));

    expect(await target(DashboardPage)).toBe("/admin");
    expect(dashboard.getAttendeeOverview).not.toHaveBeenCalled();
  });

  it("lets a failed profile read reach the error boundary instead of drawing made-up numbers", async () => {
    dashboard.getAttendeeOverview.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(DashboardPage()).rejects.toThrow("Could not read the attendee profile");
  });

  it("shows the squad badge for an attendee whose squad is in the catalog", async () => {
    const props = await renderPage();
    const badge = props.squadBadge as { type: unknown; props: { squad: { id: string } } };

    expect(props.squadCallout).toBe("badge");
    expect(badge.type).toBe(SquadBadge);
    expect(badge.props.squad.id).toBe("firebase");
    expect(props.squadHref).toBe("/squad");
  });

  it("invites an attendee without a squad to discover it, with the catalog logos", async () => {
    dashboard.getAttendeeOverview.mockResolvedValue({ ok: true, value: overviewOf(null) });

    const props = await renderPage();

    expect(props.squadCallout).toBe("discover");
    expect(props.squadPreviews).toEqual(CATALOG);
  });

  it("shows nothing about squads for an attendee without one when the feature is off", async () => {
    features.FEATURES.squads = false;
    dashboard.getAttendeeOverview.mockResolvedValue({ ok: true, value: overviewOf(null) });

    expect((await renderPage()).squadCallout).toBe("none");
  });

  it("keeps showing the squad of an attendee even when the feature is switched off", async () => {
    features.FEATURES.squads = false;

    expect((await renderPage()).squadCallout).toBe("badge");
  });

  it("falls back to a plain label for a squad that was retired from the catalog", async () => {
    dashboard.getAttendeeOverview.mockResolvedValue({ ok: true, value: overviewOf("cloud") });

    const props = await renderPage();
    const chip = props.squadBadge as { type: unknown };

    expect(props.squadCallout).toBe("badge");
    expect(chip.type).not.toBe(SquadBadge);
  });

  it("still renders the dashboard when the squad catalog cannot be read", async () => {
    squadsServer.listSquads.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    dashboard.getAttendeeOverview.mockResolvedValue({ ok: true, value: overviewOf(null) });

    const props = await renderPage();

    expect(props.squadPreviews).toEqual([]);
    expect(props.squadCallout).toBe("none"); // nothing to assign, so no invitation
  });

  it("hands the view the install hint, so iPhone users learn how to add the app to the home screen", async () => {
    const props = await renderPage();
    const slot = props.installSlot as { type: unknown };

    expect(slot.type).toBe(InstallHint);
  });

  it("hands the view the card that leads to the attendee's pass, and omits it when check-ins are off", async () => {
    const slot = (await renderPage()).passSlot as { type: unknown; props: { href: string } };

    expect(slot.type).toBe(PassCard);
    expect(slot.props.href).toBe("/pass");

    features.FEATURES.checkins = false;
    expect((await renderPage()).passSlot).toBeUndefined();
    features.FEATURES.checkins = true;
  });

  it("links the cadet card's QR button to the personal QR, and hides it when check-ins are off", async () => {
    expect((await renderPage()).qrHref).toBe("/pass");

    features.FEATURES.checkins = false;
    expect((await renderPage()).qrHref).toBeUndefined();
    features.FEATURES.checkins = true;
  });

  it("hands the view the Red card with the cadet's contacts, and leaves it out with the network off or a failed count", async () => {
    const slot = (await renderPage()).networkSlot as { type: unknown; props: Record<string, unknown> };

    expect(networkServer.countContacts).toHaveBeenCalledWith({ contacts: { marker: "network" } }, "u1");
    expect(slot.type).toBe(NetworkCard);
    expect(slot.props).toEqual({ href: "/red", contacts: 3 });

    networkServer.countContacts.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect((await renderPage()).networkSlot).toBeUndefined();

    features.FEATURES.network = false;
    networkServer.countContacts.mockClear();
    expect((await renderPage()).networkSlot).toBeUndefined();
    expect(networkServer.countContacts).not.toHaveBeenCalled();
  });

  it("hands the view the cadet's place in the fleet, and leaves it out with the ranking off or a failed read", async () => {
    const slot = (await renderPage()).standingSlot as { type: unknown; props: Record<string, unknown> };

    expect(leaderboardServer.getCadetStanding).toHaveBeenCalledWith({ marker: "leaderboard" }, "u1");
    expect(slot.type).toBe(StandingCard);
    expect(slot.props).toEqual({ standing: STANDING_VALUE, alias: "Nova_7", squad: "Escuadrón Firebase" });

    leaderboardServer.getCadetStanding.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect((await renderPage()).standingSlot).toBeUndefined();

    features.FEATURES.leaderboard = false;
    leaderboardServer.getCadetStanding.mockClear();
    expect((await renderPage()).standingSlot).toBeUndefined();
    expect(leaderboardServer.getCadetStanding).not.toHaveBeenCalled();
  });

  it("hands the view the cadet's raffle tickets from their credits, only while G-Credits and the raffle are on", async () => {
    const slot = (await renderPage()).raffleSlot as { type: unknown; props: Record<string, unknown> };

    expect(raffleServer.getCadetTickets).toHaveBeenCalledWith({ marker: "raffle" }, "u1", 3);
    expect(slot.type).toBe(RaffleTicketsCard);
    expect(slot.props).toEqual({ tickets: TICKETS });

    raffleServer.getCadetTickets.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect((await renderPage()).raffleSlot).toBeUndefined();

    raffleServer.getCadetTickets.mockClear();
    economyComposition.currentEconomy.mockResolvedValue({ ...DEFAULT_ECONOMY, creditsEnabled: false });
    expect((await renderPage()).raffleSlot).toBeUndefined();
    economyComposition.currentEconomy.mockResolvedValue(DEFAULT_ECONOMY);
    features.FEATURES.raffle = false;
    expect((await renderPage()).raffleSlot).toBeUndefined();
    expect(raffleServer.getCadetTickets).not.toHaveBeenCalled();
  });

  it("passes the attendee overview to the view untouched", async () => {
    expect((await renderPage()).overview).toEqual(overviewOf("firebase"));
  });

  it("hands the view the squad's credits card for a member, read for their squad", async () => {
    const slot = (await renderPage()).squadCreditsSlot as { type: unknown; props: Record<string, unknown> };

    expect(economyServer.getSquadStanding).toHaveBeenCalledWith({ marker: "squad-credits" }, "firebase");
    expect(slot.type).toBe(SquadCreditsCard);
    expect(slot.props).toEqual({ balance: 40, prizes: STANDING.prizes });
  });

  it("leaves the squad credits card out without a squad, with squad credits off, or when they cannot be read", async () => {
    dashboard.getAttendeeOverview.mockResolvedValue({ ok: true, value: overviewOf(null) });
    expect((await renderPage()).squadCreditsSlot).toBeUndefined();
    expect(economyServer.getSquadStanding).not.toHaveBeenCalled();

    dashboard.getAttendeeOverview.mockResolvedValue({ ok: true, value: overviewOf("firebase") });
    economyComposition.currentEconomy.mockResolvedValue({ ...DEFAULT_ECONOMY, squadCreditsEnabled: false });
    expect((await renderPage()).squadCreditsSlot).toBeUndefined();
    expect(economyServer.getSquadStanding).not.toHaveBeenCalled();

    economyComposition.currentEconomy.mockResolvedValue(DEFAULT_ECONOMY);
    economyServer.getSquadStanding.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect((await renderPage()).squadCreditsSlot).toBeUndefined();
  });

  it("opens the terminal with the open missions (XP and quadrants), and leaves them out with missions off or unreadable", async () => {
    dashboardComposition.openMissionsSummary.mockResolvedValue({ xp: 500, quadrants: ["Google Cloud", "AI"] });
    const slot = (await renderPage()).missionsSlot as { type: unknown; props: Record<string, unknown> };
    expect(slot.type).toBe(MissionsCard);
    expect(slot.props).toEqual({ href: "/missions", xp: 500, quadrants: ["Google Cloud", "AI"] });

    dashboardComposition.openMissionsSummary.mockResolvedValue(null);
    expect((await renderPage()).missionsSlot).toBeUndefined();

    features.FEATURES.missions = false;
    dashboardComposition.openMissionsSummary.mockClear();
    expect((await renderPage()).missionsSlot).toBeUndefined();
    expect(dashboardComposition.openMissionsSummary).not.toHaveBeenCalled();
    features.FEATURES.missions = true;
  });

  it("offers the Red in the account menu only with the network on", async () => {
    expect((await renderPage()).networkHref).toBe("/red");

    features.FEATURES.network = false;
    expect((await renderPage()).networkHref).toBeUndefined();
    features.FEATURES.network = true;
  });
});
