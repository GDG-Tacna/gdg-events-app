import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/rundown.server", () => ({ rundownDeps: { marker: "rundown" } }));
const guards = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/app-shell/guards", () => guards);
const modules = vi.hoisted(() => ({ moduleOn: vi.fn() }));
vi.mock("@/app-shell/modules.server", () => modules);
const permissions = vi.hoisted(() => ({ mayEdit: vi.fn() }));
vi.mock("@/app-shell/permissions.server", () => permissions);
const features = vi.hoisted(() => ({ FEATURES: { admin: true } }));
vi.mock("@/shared/config/features", () => features);
const server = vi.hoisted(() => ({ saveItemCues: vi.fn(), saveExtraPoints: vi.fn(), saveItemMinutes: vi.fn(), saveMusicPlaylist: vi.fn(), saveLayerCards: vi.fn() }));
vi.mock("@/features/rundown/server", () => server);

const { saveCardsAction, saveCuesAction, saveMinutesAction, savePlaylistAction, savePointsAction } = await import("./rundown.actions");

const CUES = [{ id: "cue-0001", kind: "slides", name: "Keynote", path: "apertura/keynote.pdf" }];
const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });

describe("saveCuesAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    modules.moduleOn.mockResolvedValue(true);
    permissions.mayEdit.mockResolvedValue(true);
    guards.getSession.mockResolvedValue(session("admin"));
    server.saveItemCues.mockResolvedValue({ ok: true, value: CUES });
  });

  it("saves the pieces of a point as the admin of the session", async () => {
    expect(await saveCuesAction({ itemId: "keynote", cues: CUES })).toEqual({ ok: true, cues: CUES });
    expect(server.saveItemCues).toHaveBeenCalledWith({ marker: "rundown" }, { uid: "a1", role: "admin" }, { itemId: "keynote", cues: CUES });
    expect(permissions.mayEdit).toHaveBeenCalledWith(expect.anything(), "stage");
  });

  it("lets a Google Slides piece through to the use case with every one of its fields", async () => {
    const deck = { id: "cue-0009", kind: "gslides", name: "Keynote", deckId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", published: false };
    server.saveItemCues.mockResolvedValue({ ok: true, value: [deck] });

    expect(await saveCuesAction({ itemId: "keynote", cues: [deck] })).toEqual({ ok: true, cues: [deck] });
    expect(server.saveItemCues).toHaveBeenCalledWith({ marker: "rundown" }, { uid: "a1", role: "admin" }, { itemId: "keynote", cues: [deck] });
  });

  it("does nothing with the admin or the stage module off", async () => {
    features.FEATURES.admin = false;
    expect(await saveCuesAction({ itemId: "keynote", cues: CUES })).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.admin = true;
    modules.moduleOn.mockResolvedValue(false);
    expect(await saveCuesAction({ itemId: "keynote", cues: CUES })).toEqual({ ok: false, code: "disabled" });
    expect(server.saveItemCues).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller, anyone who is not an admin and an admin without access to the stage", async () => {
    guards.getSession.mockResolvedValue(null);
    expect(await saveCuesAction({ itemId: "keynote", cues: CUES })).toEqual({ ok: false, code: "unauthenticated" });

    for (const role of ["attendee", "staff", null] as const) {
      guards.getSession.mockResolvedValue(session(role));
      expect(await saveCuesAction({ itemId: "keynote", cues: CUES })).toEqual({ ok: false, code: "forbidden" });
    }

    guards.getSession.mockResolvedValue(session("admin"));
    permissions.mayEdit.mockResolvedValue(false);
    expect(await saveCuesAction({ itemId: "keynote", cues: CUES })).toEqual({ ok: false, code: "forbidden" });
    expect(server.saveItemCues).not.toHaveBeenCalled();
  });

  it("refuses input of the wrong shape before the use case, and passes the use case's refusal on", async () => {
    expect(await saveCuesAction({ itemId: "keynote", cues: "no" })).toEqual({ ok: false, code: "invalid-cues" });
    expect(await saveCuesAction({ itemId: "keynote", cues: [{ id: 1 }] })).toEqual({ ok: false, code: "invalid-cues" });
    expect(server.saveItemCues).not.toHaveBeenCalled();

    server.saveItemCues.mockResolvedValue({ ok: false, error: { code: "invalid-cues" } });
    expect(await saveCuesAction({ itemId: "keynote", cues: CUES })).toEqual({ ok: false, code: "invalid-cues" });
  });
});

describe("savePointsAction and saveMinutesAction", () => {
  const POINTS = [{ id: "cafe", title: "Café", who: "", time: "10:40" }];

  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    modules.moduleOn.mockResolvedValue(true);
    permissions.mayEdit.mockResolvedValue(true);
    guards.getSession.mockResolvedValue(session("admin"));
    server.saveExtraPoints.mockResolvedValue({ ok: true, value: POINTS });
    server.saveItemMinutes.mockResolvedValue({ ok: true, value: 20 });
  });

  it("save the points made in the console as the admin of the session", async () => {
    expect(await savePointsAction({ points: POINTS })).toEqual({ ok: true, points: POINTS });
    expect(server.saveExtraPoints).toHaveBeenCalledWith({ marker: "rundown" }, { uid: "a1", role: "admin" }, { points: POINTS });
  });

  it("set and clear the minutes planned for a point", async () => {
    expect(await saveMinutesAction({ itemId: "keynote", minutes: 20 })).toEqual({ ok: true });
    expect(server.saveItemMinutes).toHaveBeenCalledWith({ marker: "rundown" }, { uid: "a1", role: "admin" }, { itemId: "keynote", minutes: 20 });
    await saveMinutesAction({ itemId: "keynote", minutes: null });
    expect(server.saveItemMinutes).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { itemId: "keynote", minutes: null });
  });

  it("refuse without a session, without the admin role or the stage permission, and with the module off", async () => {
    guards.getSession.mockResolvedValue(null);
    expect(await savePointsAction({ points: POINTS })).toEqual({ ok: false, code: "unauthenticated" });
    expect(await saveMinutesAction({ itemId: "keynote", minutes: 5 })).toEqual({ ok: false, code: "unauthenticated" });

    guards.getSession.mockResolvedValue(session("staff"));
    expect(await savePointsAction({ points: POINTS })).toEqual({ ok: false, code: "forbidden" });

    guards.getSession.mockResolvedValue(session("admin"));
    permissions.mayEdit.mockResolvedValue(false);
    expect(await saveMinutesAction({ itemId: "keynote", minutes: 5 })).toEqual({ ok: false, code: "forbidden" });

    modules.moduleOn.mockResolvedValue(false);
    expect(await savePointsAction({ points: POINTS })).toEqual({ ok: false, code: "disabled" });
    expect(server.saveExtraPoints).not.toHaveBeenCalled();
    expect(server.saveItemMinutes).not.toHaveBeenCalled();
  });

  it("refuse an input of the wrong shape before the use case, and pass its error code on", async () => {
    expect(await savePointsAction({ points: "x" } as never)).toEqual({ ok: false, code: "invalid-points" });
    expect(await saveMinutesAction({ itemId: "keynote", minutes: "5" } as never)).toEqual({ ok: false, code: "invalid-minutes" });

    server.saveExtraPoints.mockResolvedValue({ ok: false, error: { code: "invalid-points" } });
    expect(await savePointsAction({ points: POINTS })).toEqual({ ok: false, code: "invalid-points" });
  });
});

describe("savePlaylistAction", () => {
  const TRACKS = [{ id: "song-0001", name: "Intro", path: "musica/intro.mp3" }];

  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    modules.moduleOn.mockResolvedValue(true);
    permissions.mayEdit.mockResolvedValue(true);
    guards.getSession.mockResolvedValue(session("admin"));
    server.saveMusicPlaylist.mockResolvedValue({ ok: true, value: TRACKS });
  });

  it("saves the playlist as the admin of the session", async () => {
    expect(await savePlaylistAction({ tracks: TRACKS })).toEqual({ ok: true, tracks: TRACKS });
    expect(server.saveMusicPlaylist).toHaveBeenCalledWith({ marker: "rundown" }, { uid: "a1", role: "admin" }, { tracks: TRACKS });
  });

  it("refuses without a session, without the stage permission, with the module off and with a wrong shape", async () => {
    guards.getSession.mockResolvedValue(null);
    expect(await savePlaylistAction({ tracks: TRACKS })).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session("admin"));
    permissions.mayEdit.mockResolvedValue(false);
    expect(await savePlaylistAction({ tracks: TRACKS })).toEqual({ ok: false, code: "forbidden" });
    permissions.mayEdit.mockResolvedValue(true);
    modules.moduleOn.mockResolvedValue(false);
    expect(await savePlaylistAction({ tracks: TRACKS })).toEqual({ ok: false, code: "disabled" });
    modules.moduleOn.mockResolvedValue(true);
    expect(await savePlaylistAction({ tracks: "x" } as never)).toEqual({ ok: false, code: "invalid-tracks" });
    expect(server.saveMusicPlaylist).not.toHaveBeenCalled();
  });

  it("passes the use case's error code on", async () => {
    server.saveMusicPlaylist.mockResolvedValue({ ok: false, error: { code: "invalid-tracks" } });
    expect(await savePlaylistAction({ tracks: TRACKS })).toEqual({ ok: false, code: "invalid-tracks" });
  });
});

describe("saveCardsAction", () => {
  const CARDS = [{ id: "card-0001", kind: "speaker" as const, title: "Luis Eduardo", text: "Genkit", link: "", x: 4, y: 90, hideAfter: null }];

  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    modules.moduleOn.mockResolvedValue(true);
    permissions.mayEdit.mockResolvedValue(true);
    guards.getSession.mockResolvedValue(session("admin"));
    server.saveLayerCards.mockResolvedValue({ ok: true, value: CARDS });
  });

  it("saves the cards as the admin of the session", async () => {
    expect(await saveCardsAction({ cards: CARDS })).toEqual({ ok: true, cards: CARDS });
    expect(server.saveLayerCards).toHaveBeenCalledWith({ marker: "rundown" }, { uid: "a1", role: "admin" }, { cards: CARDS });
  });

  it("refuses without a session, without the stage permission, with the module off and with a wrong shape", async () => {
    guards.getSession.mockResolvedValue(null);
    expect(await saveCardsAction({ cards: CARDS })).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session("admin"));
    permissions.mayEdit.mockResolvedValue(false);
    expect(await saveCardsAction({ cards: CARDS })).toEqual({ ok: false, code: "forbidden" });
    permissions.mayEdit.mockResolvedValue(true);
    modules.moduleOn.mockResolvedValue(false);
    expect(await saveCardsAction({ cards: CARDS })).toEqual({ ok: false, code: "disabled" });
    modules.moduleOn.mockResolvedValue(true);
    expect(await saveCardsAction({ cards: [{ ...CARDS[0], x: "left" }] } as never)).toEqual({ ok: false, code: "invalid-cards" });
    expect(server.saveLayerCards).not.toHaveBeenCalled();
  });

  it("passes the use case's error code on", async () => {
    server.saveLayerCards.mockResolvedValue({ ok: false, error: { code: "invalid-cards" } });
    expect(await saveCardsAction({ cards: CARDS })).toEqual({ ok: false, code: "invalid-cards" });
  });
});
