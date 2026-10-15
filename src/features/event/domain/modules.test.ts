import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { effectiveModules, getEditionModules, listOffModules, parseOffModules, setEditionModules, type EditionModule, type ModuleDeps } from "./modules";

vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const GLOBAL = { uid: "a1", role: "admin", adminScope: "global" } as const;

function setup(stored: EditionModule[] = []) {
  let off: readonly EditionModule[] = stored;
  const deps = {
    store: {
      readOff: vi.fn(async (): Promise<Result<readonly EditionModule[], { code: string }>> => ok(off)),
      saveOff: vi.fn(async (next: readonly EditionModule[]) => ((off = next), ok(undefined))),
    },
    audit: { append: vi.fn(async () => ok(undefined)) },
    now: () => new Date(0),
  } satisfies ModuleDeps;
  return { deps, off: () => off };
}

describe("edition modules", () => {
  it("has every module on until an admin switches one off", () => {
    expect(Object.values(effectiveModules([])).every(Boolean)).toBe(true);
  });

  it("switches off what needs a module that is off", () => {
    const on = effectiveModules(["missions"]);

    expect(on.missions).toBe(false);
    expect(on.minigames).toBe(false);
    expect(on.odyssey).toBe(false);
    expect(on.raffle).toBe(true);
  });

  it("reads only known modules from what is stored", () => {
    expect(parseOffModules({ off: ["raffle", "store", 7, "network"] })).toEqual(["network", "raffle"]);
    expect(parseOffModules({ off: "raffle" })).toEqual([]);
    expect(parseOffModules(undefined)).toEqual([]);
  });

  it("answers the switches and the stored list, and reports a failed read", async () => {
    const { deps } = setup(["network"]);

    const switches = await getEditionModules(deps);
    expect(switches.ok && switches.value.network).toBe(false);
    expect(await listOffModules(deps)).toEqual(ok(["network"]));

    deps.store.readOff.mockResolvedValueOnce(err({ code: "unknown" }));
    expect(await getEditionModules(deps)).toEqual(err({ code: "unknown" }));
  });
});

describe("setEditionModules", () => {
  it("saves the modules off in a fixed order and audits only a real change", async () => {
    const t = setup();

    const saved = await setEditionModules(t.deps, GLOBAL, { off: ["raffle", "network"], eventId: "meetup-nov" });
    expect(saved.ok && saved.value.raffle).toBe(false);
    expect(t.off()).toEqual(["network", "raffle"]);
    expect(t.deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "event.modules", targetUid: "meetup-nov", details: { off: "network,raffle", previous: null } }));

    await setEditionModules(t.deps, GLOBAL, { off: ["network", "raffle"], eventId: "meetup-nov" });
    expect(t.deps.audit.append).toHaveBeenCalledTimes(1);
  });

  it("refuses an organizer and an unknown module before saving", async () => {
    const t = setup();

    expect(await setEditionModules(t.deps, { uid: "o1", role: "admin", adminScope: "edition" }, { off: [], eventId: "e1" })).toEqual(err({ code: "forbidden" }));
    expect(await setEditionModules(t.deps, GLOBAL, { off: ["checkins"], eventId: "e1" })).toEqual(err({ code: "invalid-modules" }));
    expect(t.deps.store.saveOff).not.toHaveBeenCalled();
  });
});
