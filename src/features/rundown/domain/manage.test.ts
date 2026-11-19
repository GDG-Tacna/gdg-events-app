import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { getStoredCues, saveItemCues, type RundownStore } from "./manage";

const ADMIN = { uid: "a1", role: "admin" as const };
const SLIDES = { id: "cue-0001", kind: "slides" as const, name: "Keynote", path: "apertura/keynote.pdf" };

function setup(overrides: Partial<RundownStore> = {}) {
  const saveItem = vi.fn(async () => ok(undefined));
  const store: RundownStore = { read: async () => ok({ keynote: [SLIDES] }), saveItem, ...overrides };
  return { store, saveItem };
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
