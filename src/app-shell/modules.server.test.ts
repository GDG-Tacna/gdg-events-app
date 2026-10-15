import { beforeEach, describe, expect, it, vi } from "vitest";

// The test setup replaces this module everywhere; here the real one is under test.
vi.unmock("@/app-shell/modules.server");
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));
const features = vi.hoisted(() => ({ FEATURES: { admin: true, missions: true, raffle: true, network: false, minigames: true } as Record<string, boolean> }));
vi.mock("@/shared/config/features", () => features);
const composition = vi.hoisted(() => ({ editionModules: vi.fn() }));
vi.mock("./composition/event.server", () => composition);

const { moduleOn, moduleSwitches } = await import("./modules.server");
const { effectiveModules } = await import("@/features/event/domain/modules");

describe("moduleOn", () => {
  beforeEach(() => {
    composition.editionModules.mockReset();
    composition.editionModules.mockResolvedValue({ ok: true, value: effectiveModules(["raffle", "missions"]) });
  });

  it("is off when the code has it off, whatever the edition says", async () => {
    expect(await moduleOn("network")).toBe(false);
  });

  it("follows the edition's switches for its modules, and what they need", async () => {
    expect(await moduleOn("raffle")).toBe(false);
    expect(await moduleOn("minigames")).toBe(false);
    expect(await moduleOn("admin")).toBe(true);
  });

  it("never hides a module when the switches cannot be read", async () => {
    composition.editionModules.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(await moduleOn("raffle")).toBe(true);
  });

  it("answers every edition module at once", async () => {
    const switches = await moduleSwitches();

    expect(switches.raffle).toBe(false);
    expect(switches.network).toBe(false);
    expect(switches.missions).toBe(false);
  });
});
