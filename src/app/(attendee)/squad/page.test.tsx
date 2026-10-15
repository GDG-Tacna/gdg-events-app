import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/attendee.server", () => ({ attendeeDeps: { attendees: { marker: "attendees" } } }));
vi.mock("@/app-shell/composition/squads.server", () => ({ squadDeps: { catalog: { marker: "catalog" } } }));
vi.mock("@/app-shell/squads/assign-squad.action", () => ({ assignSquadAction: async () => ({ ok: true }) }));

const guards = { requireRole: vi.fn() };
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

const attendeeServer = { getAttendee: vi.fn() };
vi.mock("@/features/attendee/server", () => attendeeServer);
const squadsServer = { listSquads: vi.fn() };
vi.mock("@/features/squads/server", () => squadsServer);

const features = vi.hoisted(() => ({ FEATURES: { squads: true } }));
vi.mock("@/shared/config/features", () => features);

const { ROUTES } = await import("@/shared/config/routes");
const { default: SquadPage } = await import("./page");

const ok = <T,>(value: T) => ({ ok: true as const, value });
const SQUAD = { id: "firebase", name: "Firebase", active: true, order: 1 };
const ATTENDEE = { uid: "u1", alias: "Nova", squad: null };

describe("SquadPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    features.FEATURES.squads = true;
    guards.requireRole.mockResolvedValue({ uid: "u1", role: "attendee" });
    attendeeServer.getAttendee.mockResolvedValue(ok(ATTENDEE));
    squadsServer.listSquads.mockResolvedValue(ok([SQUAD]));
  });

  it("shows the reveal while there are squads to offer", async () => {
    await expect(SquadPage()).resolves.toBeTruthy();
  });

  it("sends a cadet on to the dashboard when the edition has no squads yet, instead of a not-found page", async () => {
    squadsServer.listSquads.mockResolvedValue(ok([]));
    await expect(SquadPage()).rejects.toEqual(new Redirected(ROUTES.dashboard));

    squadsServer.listSquads.mockResolvedValue(ok([{ ...SQUAD, active: false }]));
    await expect(SquadPage()).rejects.toEqual(new Redirected(ROUTES.dashboard));
  });

  it("still shows a cadet their squad after every squad was retired", async () => {
    attendeeServer.getAttendee.mockResolvedValue(ok({ ...ATTENDEE, squad: "firebase" }));
    squadsServer.listSquads.mockResolvedValue(ok([{ ...SQUAD, active: false }]));

    await expect(SquadPage()).resolves.toBeTruthy();
  });

  it("sends a cadet without a profile to onboarding, and does not exist with squads off", async () => {
    attendeeServer.getAttendee.mockResolvedValue(ok(null));
    await expect(SquadPage()).rejects.toEqual(new Redirected(ROUTES.onboarding));

    features.FEATURES.squads = false;
    await expect(SquadPage()).rejects.toBeInstanceOf(NotFound);
  });
});
