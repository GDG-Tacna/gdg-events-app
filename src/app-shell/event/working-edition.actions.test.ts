import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../composition/event.server", () => ({ editionsDeps: { marker: "editions" } }));
const composition = vi.hoisted(() => ({ editionRolesOf: vi.fn() }));
vi.mock("../composition/admin.server", () => composition);
const guards = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../guards", () => guards);
const cookie = vi.hoisted(() => ({ writeWorkingEdition: vi.fn() }));
vi.mock("../working-edition.server", () => cookie);
const server = vi.hoisted(() => ({ listEditionChoices: vi.fn() }));
vi.mock("@/features/event/server", () => server);
const features = vi.hoisted(() => ({ FEATURES: { admin: true } }));
vi.mock("@/shared/config/features", () => features);

const { chooseWorkingEditionAction } = await import("./working-edition.actions");
const { allowedEditions, loadEditionSwitch } = await import("./working-edition.server");

const LIVE = { id: "devfest-2026", name: "DevFest", isPublic: true, stage: "live" };
const DRAFT = { id: "meetup-nov", name: "Meetup", isPublic: false, stage: "draft" };
const session = (extra: Record<string, unknown>) => ({ uid: "u1", displayName: null, photoUrl: null, ...extra });

describe("working edition", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    cookie.writeWorkingEdition.mockResolvedValue(true);
    server.listEditionChoices.mockImplementation(async (_deps: unknown, allowed: "all" | readonly string[]) => ({
      ok: true,
      value: [LIVE, DRAFT].filter((choice) => allowed === "all" || allowed.includes(choice.id)),
    }));
    composition.editionRolesOf.mockResolvedValue([
      { eventId: "meetup-nov", role: "organizer" },
      { eventId: "taller-dic", role: "staff" },
    ]);
  });

  it("allows every edition to a global admin, an organizer's own editions, and none to anyone else", async () => {
    expect(await allowedEditions(session({ role: "admin", adminScope: "global" }) as never)).toBe("all");
    expect(await allowedEditions(session({ role: "admin", adminScope: "edition" }) as never)).toEqual(["meetup-nov"]);
    expect(await allowedEditions(session({ role: null, otherEditions: [{ eventId: "meetup-nov", role: "organizer" }] }) as never)).toEqual(["meetup-nov"]);
    expect(await allowedEditions(session({ role: null, otherEditions: [{ eventId: "taller-dic", role: "staff" }] }) as never)).toBeNull();
    expect(await allowedEditions(session({ role: "staff" }) as never)).toBeNull();
  });

  it("loads the picker with the edition the session works in, else the public one", async () => {
    expect(await loadEditionSwitch(session({ role: "admin", adminScope: "global", workingEdition: "meetup-nov" }) as never)).toEqual({ choices: [LIVE, DRAFT], current: DRAFT });
    expect(await loadEditionSwitch(session({ role: "admin", adminScope: "global" }) as never)).toEqual({ choices: [LIVE, DRAFT], current: LIVE });
    expect(await loadEditionSwitch(session({ role: "staff" }) as never)).toBeNull();
  });

  it("saves a draft edition as the working edition, and clears it when the public one is picked", async () => {
    guards.getSession.mockResolvedValue(session({ role: "admin", adminScope: "global" }));

    expect(await chooseWorkingEditionAction({ id: "meetup-nov" })).toEqual({ ok: true });
    expect(cookie.writeWorkingEdition).toHaveBeenLastCalledWith("u1", "meetup-nov");
    expect(await chooseWorkingEditionAction({ id: "devfest-2026" })).toEqual({ ok: true });
    expect(cookie.writeWorkingEdition).toHaveBeenLastCalledWith("u1", null);
  });

  it("refuses an edition the session may not pick, a bad id, no session and the area off", async () => {
    guards.getSession.mockResolvedValue(session({ role: "admin", adminScope: "edition" }));
    expect(await chooseWorkingEditionAction({ id: "devfest-2026" })).toEqual({ ok: false, code: "forbidden" });
    expect(await chooseWorkingEditionAction({ id: "Not Valid" })).toEqual({ ok: false, code: "not-found" });

    guards.getSession.mockResolvedValue(session({ role: "attendee" }));
    expect(await chooseWorkingEditionAction({ id: "meetup-nov" })).toEqual({ ok: false, code: "forbidden" });

    guards.getSession.mockResolvedValue(null);
    expect(await chooseWorkingEditionAction({ id: "meetup-nov" })).toEqual({ ok: false, code: "unauthenticated" });
    features.FEATURES.admin = false;
    expect(await chooseWorkingEditionAction({ id: "meetup-nov" })).toEqual({ ok: false, code: "disabled" });
    expect(cookie.writeWorkingEdition).not.toHaveBeenCalled();
  });

  it("says when the server cannot sign the choice", async () => {
    guards.getSession.mockResolvedValue(session({ role: "admin", adminScope: "global" }));
    cookie.writeWorkingEdition.mockResolvedValue(false);

    expect(await chooseWorkingEditionAction({ id: "meetup-nov" })).toEqual({ ok: false, code: "unavailable" });
  });
});
