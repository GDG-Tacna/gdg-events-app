import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Outside a request, React's cache does not memoize: each call reads again, which the tests rely on.
const composition = vi.hoisted(() => ({ keptSpeakerAccess: vi.fn() }));
vi.mock("@/app-shell/composition/speakers.server", () => composition);
const modules = vi.hoisted(() => ({ moduleOn: vi.fn(async () => true) }));
vi.mock("@/app-shell/modules.server", () => modules);

const { linkedSpeaker, speakerDetour } = await import("./linked-speaker.server");

const ROWS = [
  { speakerId: "ana-torres", name: "Ana Torres", active: true, accountUid: "uid-ana", invite: null },
  { speakerId: "luis-paz", name: "Luis Paz", active: false, accountUid: "uid-luis", invite: null },
];

describe("linkedSpeaker", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    composition.keptSpeakerAccess.mockResolvedValue({ ok: true, value: ROWS });
  });

  it("finds the active speaker linked to the account, and nobody for others or for an inactive speaker", async () => {
    expect(await linkedSpeaker("uid-ana")).toEqual({ id: "ana-torres", name: "Ana Torres" });
    expect(await linkedSpeaker("uid-luis")).toBeNull();
    expect(await linkedSpeaker("uid-cadet")).toBeNull();
  });

  it("treats a failed read as no speaker, so a cadet is never locked out", async () => {
    composition.keptSpeakerAccess.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(await linkedSpeaker("uid-ana")).toBeNull();
  });
});

describe("speakerDetour", () => {
  beforeEach(() => {
    composition.keptSpeakerAccess.mockResolvedValue({ ok: true, value: ROWS });
    modules.moduleOn.mockResolvedValue(true);
  });

  it("lets a speaker who is a cadet play when speakers may play, and starts one without a profile on their code", async () => {
    expect(await speakerDetour({ uid: "uid-ana", role: "attendee" })).toBeNull();
    expect(await speakerDetour({ uid: "uid-ana", role: null })).toBe("code");
  });

  it("gives a speaker only their code when speakers may not play", async () => {
    modules.moduleOn.mockResolvedValue(false);

    expect(await speakerDetour({ uid: "uid-ana", role: "attendee" })).toBe("code");
    expect(await speakerDetour({ uid: "uid-ana", role: null })).toBe("code");
    expect(modules.moduleOn).toHaveBeenCalledWith("speakerPlay");
  });

  it("never changes anything for a cadet who is not a speaker, nor for staff and admins", async () => {
    modules.moduleOn.mockResolvedValue(false);

    expect(await speakerDetour({ uid: "uid-cadet", role: "attendee" })).toBeNull();
    expect(await speakerDetour({ uid: "uid-ana", role: "staff" })).toBeNull();
    expect(await speakerDetour({ uid: "uid-ana", role: "admin" })).toBeNull();
  });
});
