import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { getRundownPlan, getStoredCues, saveExtraPoints, saveItemCues, saveItemMinutes, saveLayerCards, saveMusicPlaylist, type RundownStore } from "./manage";

const ADMIN = { uid: "a1", role: "admin" as const };
const SLIDES = { id: "cue-0001", kind: "slides" as const, name: "Keynote", path: "apertura/keynote.pdf" };

function setup(overrides: Partial<RundownStore> = {}) {
  const saveItem = vi.fn(async () => ok(undefined));
  const savePoints = vi.fn(async () => ok(undefined));
  const saveMinutes = vi.fn(async () => ok(undefined));
  const savePlaylist = vi.fn(async () => ok(undefined));
  const saveCards = vi.fn(async () => ok(undefined));
  const store: RundownStore = { read: async () => ok({ keynote: [SLIDES] }), saveItem, readPlan: async () => ok({ points: [], minutes: {}, playlist: [], cards: [] }), savePoints, saveMinutes, savePlaylist, saveCards, ...overrides };
  return { store, saveItem, savePoints, saveMinutes, savePlaylist, saveCards };
}

describe("getStoredCues", () => {
  it("gives the stored order to an admin and to nobody else", async () => {
    const { store } = setup();

    expect(await getStoredCues({ store }, ADMIN)).toEqual(ok({ keynote: [SLIDES] }));
    for (const role of ["staff", "attendee", null] as const) expect(await getStoredCues({ store }, { uid: "x", role })).toEqual(err({ code: "forbidden" }));
  });

  it("reports a failed read", async () => {
    const { store } = setup({ read: async () => err({ code: "down" }) });

    expect(await getStoredCues({ store }, ADMIN)).toEqual(err({ code: "unknown" }));
  });
});

describe("saveItemCues", () => {
  it("saves the checked pieces of a point and answers them", async () => {
    const { store, saveItem } = setup();

    expect(await saveItemCues({ store }, ADMIN, { itemId: "keynote", cues: [SLIDES] })).toEqual(ok([SLIDES]));
    expect(saveItem).toHaveBeenCalledWith("keynote", [SLIDES]);
  });

  it("refuses a non-admin, a bad point id and bad pieces, saving nothing", async () => {
    const { store, saveItem } = setup();

    expect(await saveItemCues({ store }, { uid: "s", role: "staff" }, { itemId: "keynote", cues: [] })).toEqual(err({ code: "forbidden" }));
    expect(await saveItemCues({ store }, ADMIN, { itemId: "Key note", cues: [] })).toEqual(err({ code: "invalid-item" }));
    expect(await saveItemCues({ store }, ADMIN, { itemId: "a.b", cues: [] })).toEqual(err({ code: "invalid-item" }));
    expect(await saveItemCues({ store }, ADMIN, { itemId: "keynote", cues: [{ ...SLIDES, path: "../x.pdf" }] })).toEqual(err({ code: "invalid-cues" }));
    expect(await saveItemCues({ store }, ADMIN, { itemId: "keynote", cues: "no" })).toEqual(err({ code: "invalid-cues" }));
    expect(saveItem).not.toHaveBeenCalled();
  });

  it("reports a failed save", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store } = setup({ saveItem: async () => err({ code: "down" }) });

    expect(await saveItemCues({ store }, ADMIN, { itemId: "keynote", cues: [SLIDES] })).toEqual(err({ code: "unknown" }));
  });
});

describe("getRundownPlan", () => {
  it("gives the points made in the console and the minutes planned to an admin and to nobody else", async () => {
    const plan = { points: [{ id: "cafe", title: "Café", who: "", time: "10:40" }], minutes: { keynote: 20 }, playlist: [], cards: [] };
    const { store } = setup({ readPlan: async () => ok(plan) });

    expect(await getRundownPlan({ store }, ADMIN)).toEqual(ok(plan));
    expect(await getRundownPlan({ store }, { uid: "s", role: "staff" })).toEqual(err({ code: "forbidden" }));
    expect(await getRundownPlan({ store: setup({ readPlan: async () => err({ code: "down" }) }).store }, ADMIN)).toEqual(err({ code: "unknown" }));
  });
});

describe("saveExtraPoints", () => {
  const BREAK = { id: "cafe", title: " Café ", who: "", time: "10:40" };

  it("saves the checked points and answers them", async () => {
    const { store, savePoints } = setup();

    expect(await saveExtraPoints({ store }, ADMIN, { points: [BREAK] })).toEqual(ok([{ id: "cafe", title: "Café", who: "", time: "10:40" }]));
    expect(savePoints).toHaveBeenCalledWith([{ id: "cafe", title: "Café", who: "", time: "10:40" }]);
  });

  it("refuses a non-admin and any invalid point, saving nothing", async () => {
    const { store, savePoints } = setup();

    expect(await saveExtraPoints({ store }, { uid: "s", role: "staff" }, { points: [] })).toEqual(err({ code: "forbidden" }));
    for (const points of ["x", [{ id: "A", title: "Mal", who: "", time: "" }], [{ id: "cafe", title: "", who: "", time: "" }], [{ id: "cafe", title: "Café", who: "", time: "25:00" }], [BREAK, BREAK]]) {
      expect(await saveExtraPoints({ store }, ADMIN, { points })).toEqual(err({ code: "invalid-points" }));
    }
    expect(savePoints).not.toHaveBeenCalled();
  });

  it("reports a failed save", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store } = setup({ savePoints: async () => err({ code: "down" }) });

    expect(await saveExtraPoints({ store }, ADMIN, { points: [BREAK] })).toEqual(err({ code: "unknown" }));
  });
});

describe("saveItemMinutes", () => {
  it("sets the minutes planned for a point, or clears them", async () => {
    const { store, saveMinutes } = setup();

    expect(await saveItemMinutes({ store }, ADMIN, { itemId: "keynote", minutes: 20 })).toEqual(ok(20));
    expect(await saveItemMinutes({ store }, ADMIN, { itemId: "keynote", minutes: null })).toEqual(ok(null));
    expect(saveMinutes.mock.calls).toEqual([["keynote", 20], ["keynote", null]]);
  });

  it("refuses a non-admin, a bad point id and minutes that are not whole between 1 and 600", async () => {
    const { store, saveMinutes } = setup();

    expect(await saveItemMinutes({ store }, { uid: "s", role: "staff" }, { itemId: "keynote", minutes: 5 })).toEqual(err({ code: "forbidden" }));
    expect(await saveItemMinutes({ store }, ADMIN, { itemId: "../x", minutes: 5 })).toEqual(err({ code: "invalid-item" }));
    for (const minutes of [0, -3, 601, 2.5, "5", undefined]) expect(await saveItemMinutes({ store }, ADMIN, { itemId: "keynote", minutes })).toEqual(err({ code: "invalid-minutes" }));
    expect(saveMinutes).not.toHaveBeenCalled();
  });

  it("reports a failed save", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store } = setup({ saveMinutes: async () => err({ code: "down" }) });

    expect(await saveItemMinutes({ store }, ADMIN, { itemId: "keynote", minutes: 5 })).toEqual(err({ code: "unknown" }));
  });
});

describe("saveMusicPlaylist", () => {
  const SONG = { id: "song-0001", name: " Intro ", path: "musica/intro.mp3" };

  it("saves the checked songs of the playlist and answers them", async () => {
    const { store, savePlaylist } = setup();

    expect(await saveMusicPlaylist({ store }, ADMIN, { tracks: [SONG] })).toEqual(ok([{ id: "song-0001", name: "Intro", path: "musica/intro.mp3" }]));
    expect(savePlaylist).toHaveBeenCalledWith([{ id: "song-0001", name: "Intro", path: "musica/intro.mp3" }]);
    expect(await saveMusicPlaylist({ store }, ADMIN, { tracks: [] })).toEqual(ok([]));
  });

  it("refuses a non-admin, a file that is not audio, a path outside the folder and a repeated id, saving nothing", async () => {
    const { store, savePlaylist } = setup();

    expect(await saveMusicPlaylist({ store }, { uid: "s", role: "staff" }, { tracks: [] })).toEqual(err({ code: "forbidden" }));
    for (const tracks of ["x", [{ ...SONG, path: "musica/video.mp4" }], [{ ...SONG, path: "../intro.mp3" }], [{ ...SONG, path: "/intro.mp3" }], [{ ...SONG, name: "" }], [SONG, SONG]]) {
      expect(await saveMusicPlaylist({ store }, ADMIN, { tracks })).toEqual(err({ code: "invalid-tracks" }));
    }
    expect(savePlaylist).not.toHaveBeenCalled();
  });

  it("reports a failed save", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store } = setup({ savePlaylist: async () => err({ code: "down" }) });

    expect(await saveMusicPlaylist({ store }, ADMIN, { tracks: [SONG] })).toEqual(err({ code: "unknown" }));
  });
});

describe("saveLayerCards", () => {
  const CARD = { id: "card-0001", kind: "speaker", title: " Luis Eduardo ", text: "Genkit", link: "", x: 4, y: 90, hideAfter: 10 };

  it("saves the checked cards with their place and answers them", async () => {
    const { store, saveCards } = setup();

    expect(await saveLayerCards({ store }, ADMIN, { cards: [CARD] })).toEqual(ok([{ ...CARD, title: "Luis Eduardo" }]));
    expect(saveCards).toHaveBeenCalledWith([{ ...CARD, title: "Luis Eduardo" }]);
    expect(await saveLayerCards({ store }, ADMIN, { cards: [] })).toEqual(ok([]));
  });

  it("refuses a non-admin, a place off the screen, a bad kind, an empty title and a repeated id, saving nothing", async () => {
    const { store, saveCards } = setup();

    expect(await saveLayerCards({ store }, { uid: "s", role: "staff" }, { cards: [] })).toEqual(err({ code: "forbidden" }));
    for (const cards of ["x", [{ ...CARD, x: 120 }], [{ ...CARD, y: -1 }], [{ ...CARD, kind: "banner" }], [{ ...CARD, title: " " }], [{ ...CARD, hideAfter: 0 }], [{ ...CARD, hideAfter: 601 }], [CARD, CARD]]) {
      expect(await saveLayerCards({ store }, ADMIN, { cards })).toEqual(err({ code: "invalid-cards" }));
    }
    expect(saveCards).not.toHaveBeenCalled();
  });

  it("reports a failed save", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store } = setup({ saveCards: async () => err({ code: "down" }) });

    expect(await saveLayerCards({ store }, ADMIN, { cards: [CARD] })).toEqual(err({ code: "unknown" }));
  });
});
