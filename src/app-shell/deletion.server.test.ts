import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const switcher = vi.hoisted(() => ({ loadEditionSwitch: vi.fn() }));
vi.mock("./event/working-edition.server", () => switcher);

const { mayDeleteItems } = await import("./deletion.server");

const organizer = { role: "admin" as const, adminScope: "edition" as const };
const choice = (lifecycle: string) => ({ choices: [], current: { id: "e1", name: null, isPublic: false, stage: "draft", lifecycle } });

describe("mayDeleteItems", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lets an admin of every edition delete without reading the edition", async () => {
    expect(await mayDeleteItems({ role: "admin", adminScope: "global" })).toBe(true);
    expect(switcher.loadEditionSwitch).not.toHaveBeenCalled();
  });

  it("lets an organizer delete only while the edition they work in is a draft", async () => {
    switcher.loadEditionSwitch.mockResolvedValueOnce(choice("draft"));
    expect(await mayDeleteItems(organizer)).toBe(true);
    switcher.loadEditionSwitch.mockResolvedValueOnce(choice("published"));
    expect(await mayDeleteItems(organizer)).toBe(false);
    switcher.loadEditionSwitch.mockResolvedValueOnce(choice("finished"));
    expect(await mayDeleteItems(organizer)).toBe(false);
  });

  it("says no when the edition cannot be told, and for anyone who is not an admin", async () => {
    switcher.loadEditionSwitch.mockResolvedValueOnce(null);
    expect(await mayDeleteItems(organizer)).toBe(false);
    switcher.loadEditionSwitch.mockResolvedValueOnce({ choices: [], current: null });
    expect(await mayDeleteItems(organizer)).toBe(false);
    switcher.loadEditionSwitch.mockRejectedValueOnce(new Error("offline"));
    expect(await mayDeleteItems(organizer)).toBe(false);
    for (const role of ["staff", "attendee", null] as const) expect(await mayDeleteItems({ role, adminScope: "global" } as never)).toBe(false);
  });
});
