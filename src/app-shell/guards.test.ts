import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./composition/auth.server", () => ({ authDeps: { sessions: {} } }));
const team = vi.hoisted(() => ({
  editionRoleOf: vi.fn<(uid: string, eventId: string) => Promise<"staff" | "organizer" | null>>(async () => "staff"),
  editionRolesOf: vi.fn(async (): Promise<ReadonlyArray<{ eventId: string; role: "staff" | "organizer" }>> => []),
}));
vi.mock("./composition/admin.server", () => team);
const edition = vi.hoisted(() => ({ publicEditionId: vi.fn(async () => "devfest-2026"), registerRequestEdition: vi.fn() }));
vi.mock("@/features/event/server", () => edition);
const working = vi.hoisted(() => ({ readWorkingEdition: vi.fn(async (): Promise<string | null> => null), hasWorkingEditionCookie: vi.fn(async () => false) }));
vi.mock("./working-edition.server", () => working);

// Next.js implements redirect/notFound by throwing; mirror that so the guards stop like they do in production.
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

const authServer = { readSession: vi.fn(), readSessionCookie: vi.fn() };
vi.mock("@/features/auth/server", async () => {
  const roles = await import("@/features/auth/domain/roles");
  return { ...authServer, canAccess: roles.canAccess };
});

const { requireAttendee, requireOnboardingPending, requireRole, requireSession } = await import("./guards");
// Registered once, when the guard module loads.
const requestEdition = edition.registerRequestEdition.mock.calls[0][0] as () => Promise<string | null>;

const signedIn = (role: "attendee" | "staff" | "organizer" | "admin" | null) =>
  authServer.readSession.mockResolvedValue({
    ok: true,
    value: { uid: "u1", role, displayName: null, photoUrl: null },
  });

const redirectTarget = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    if (error instanceof Redirected) return error.to;
    if (error instanceof NotFound) return "not-found";
    throw error;
  }
  return null;
};

describe("guards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authServer.readSessionCookie.mockResolvedValue("cookie");
    team.editionRoleOf.mockResolvedValue("staff");
    team.editionRolesOf.mockResolvedValue([]);
    edition.publicEditionId.mockResolvedValue("devfest-2026");
    working.readWorkingEdition.mockResolvedValue(null);
    working.hasWorkingEditionCookie.mockResolvedValue(false);
  });

  describe("requireSession", () => {
    it("sends a visitor without a valid session to /login", async () => {
      authServer.readSession.mockResolvedValue({ ok: false, error: { code: "unauthenticated" } });

      expect(await redirectTarget(requireSession)).toBe("/login");
    });

    it("returns the verified session", async () => {
      signedIn("attendee");

      await expect(requireSession()).resolves.toMatchObject({ uid: "u1", role: "attendee" });
    });
  });

  describe("roles per edition", () => {
    it("sends staff of another edition to register as an attendee", async () => {
      signedIn("staff");
      team.editionRoleOf.mockResolvedValue(null);

      expect(await redirectTarget(() => requireRole(["staff"]))).toBe("/onboarding");
    });

    it("lets an organizer of this edition into the control center as an edition admin", async () => {
      signedIn("organizer");
      team.editionRoleOf.mockResolvedValue("organizer");

      await expect(requireRole(["admin"])).resolves.toMatchObject({ role: "admin", adminScope: "edition" });
    });

    it("checks the team of the public edition", async () => {
      signedIn("staff");

      await requireRole(["staff"]);

      expect(team.editionRoleOf).toHaveBeenCalledWith("u1", "devfest-2026");
    });

    it("sends a staff or organizer of another edition to their editions, never to sign up as a cadet", async () => {
      signedIn("organizer");
      team.editionRoleOf.mockResolvedValue(null);
      team.editionRolesOf.mockResolvedValue([{ eventId: "meetup-nov", role: "organizer" }]);

      expect(await redirectTarget(() => requireRole(["admin"]))).toBe("/mis-eventos");
      expect(await redirectTarget(requireAttendee)).toBe("/mis-eventos");
      expect(await redirectTarget(requireOnboardingPending)).toBe("/mis-eventos");
    });

    it("lets an organizer work in the edition its signed cookie names, where it is organizer", async () => {
      signedIn("organizer");
      working.readWorkingEdition.mockResolvedValue("meetup-nov");
      team.editionRoleOf.mockImplementation(async (_uid: string, eventId: string) => (eventId === "meetup-nov" ? "organizer" : null));

      await expect(requireRole(["admin"])).resolves.toMatchObject({ role: "admin", adminScope: "edition", workingEdition: "meetup-nov" });
      expect(working.readWorkingEdition).toHaveBeenCalledWith("u1");
    });

    it("keeps an organizer listed only as staff out of the control center", async () => {
      signedIn("organizer");
      team.editionRoleOf.mockResolvedValue("staff");

      expect(await redirectTarget(() => requireRole(["admin"]))).toBe("not-found");
    });
  });

  describe("requireRole", () => {
    it("sends a signed-in user without a role to onboarding", async () => {
      signedIn(null);

      expect(await redirectTarget(() => requireRole(["attendee"]))).toBe("/onboarding");
    });

    it("sends a visitor without a session to /login before anything else", async () => {
      authServer.readSession.mockResolvedValue({ ok: false, error: { code: "unauthenticated" } });

      expect(await redirectTarget(() => requireRole(["attendee"]))).toBe("/login");
    });

    it("lets a role that the surface allows through", async () => {
      signedIn("attendee");

      expect(await redirectTarget(() => requireRole(["attendee"]))).toBeNull();
    });

    it("answers not found for a role the surface does not allow", async () => {
      signedIn("attendee");

      expect(await redirectTarget(() => requireRole(["staff"]))).toBe("not-found");
    });

    it("lets admin reach any surface", async () => {
      signedIn("admin");

      expect(await redirectTarget(() => requireRole(["attendee"]))).toBeNull();
    });
  });

  describe("requireAttendee", () => {
    it("lets an attendee through and returns the session", async () => {
      signedIn("attendee");

      await expect(requireAttendee()).resolves.toMatchObject({ uid: "u1", role: "attendee" });
    });

    it("sends a visitor to /login and a user without a role to onboarding", async () => {
      authServer.readSession.mockResolvedValue({ ok: false, error: { code: "unauthenticated" } });
      expect(await redirectTarget(requireAttendee)).toBe("/login");

      signedIn(null);
      expect(await redirectTarget(requireAttendee)).toBe("/onboarding");
    });

    it("sends staff to the serving points and admins to the control center instead of an attendee screen", async () => {
      signedIn("staff");
      expect(await redirectTarget(requireAttendee)).toBe("/staff");

      signedIn("admin");
      expect(await redirectTarget(requireAttendee)).toBe("/admin");
    });
  });

  describe("requireOnboardingPending", () => {
    it("lets a user who still has no role onboard", async () => {
      signedIn(null);

      expect(await redirectTarget(requireOnboardingPending)).toBeNull();
    });

    it.each(["attendee", "staff", "admin"] as const)("sends an existing %s to the dashboard", async (role) => {
      signedIn(role);

      expect(await redirectTarget(requireOnboardingPending)).toBe("/dashboard");
    });
  });

  describe("the request's working edition", () => {
    it("is none without the cookie, and never reads the session for it", async () => {
      expect(await requestEdition()).toBeNull();
      expect(authServer.readSession).not.toHaveBeenCalled();
    });

    it("is the session's checked working edition when the cookie is there", async () => {
      working.hasWorkingEditionCookie.mockResolvedValue(true);
      working.readWorkingEdition.mockResolvedValue("meetup-nov");
      signedIn("admin");

      expect(await requestEdition()).toBe("meetup-nov");
    });

    it("is none when the session may not work there", async () => {
      working.hasWorkingEditionCookie.mockResolvedValue(true);
      working.readWorkingEdition.mockResolvedValue("meetup-nov");
      signedIn("staff");

      expect(await requestEdition()).toBeNull();
    });
  });
});
