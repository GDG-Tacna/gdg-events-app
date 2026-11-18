import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ findByUid: vi.fn(), listFor: vi.fn(), squads: vi.fn() }));
vi.mock("./attendee.server", () => ({ attendeeDeps: { attendees: { findByUid: mocks.findByUid } } }));
vi.mock("./network.server", () => ({ networkStore: { listFor: mocks.listFor } }));
vi.mock("./squads.server", () => ({ squadCatalog: { list: mocks.squads } }));

const { squadProgress } = await import("./squad-progress.server");

const ok = <T,>(value: T) => ({ ok: true as const, value });
const contact = (a: string, b: string) => ({ id: `${a}_${b}`, uids: [a, b] as const, scannedBy: a, createdAt: new Date(0) });
const cadet = (uid: string, squad: string | null, role = "attendee") => ({ uid, alias: uid, role, squad });
const SQUADS = [
  { id: "angular", name: "Angular", active: true },
  { id: "firebase", name: "Firebase", active: true },
  { id: "gemini", name: "Gemini", active: true },
  { id: "retired", name: "Retirado", active: false },
];

describe("squadProgress", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.squads.mockResolvedValue(ok(SQUADS));
    const people: Record<string, ReturnType<typeof cadet>> = {
      me: cadet("me", "angular"),
      ana: cadet("ana", "firebase"),
      bruno: cadet("bruno", "gemini"),
      carla: cadet("carla", "firebase"),
      nosquad: cadet("nosquad", null),
      staff: cadet("staff", "gemini", "staff"),
    };
    mocks.findByUid.mockImplementation(async (uid: string) => ok(people[uid] ?? null));
  });

  it("asks for every active squad but the cadet's own, and lists the squads of their contacts", async () => {
    mocks.listFor.mockResolvedValue(ok([contact("ana", "me"), contact("me", "bruno")]));

    expect(await squadProgress("me")).toEqual(ok({ met: ["firebase", "gemini"], required: ["firebase", "gemini"] }));
  });

  it("counts each squad once, and nothing for a contact with no squad, a contact who left the edition, or a non-cadet", async () => {
    mocks.listFor.mockResolvedValue(ok([contact("ana", "me"), contact("carla", "me"), contact("me", "nosquad"), contact("me", "ghost"), contact("me", "staff")]));

    expect(await squadProgress("me")).toEqual(ok({ met: ["firebase"], required: ["firebase", "gemini"] }));
  });

  it("asks for nothing from a cadet with no squad, or who is not a cadet of the edition", async () => {
    mocks.listFor.mockResolvedValue(ok([contact("ana", "nosquad")]));
    expect(await squadProgress("nosquad")).toEqual(ok({ met: ["firebase"], required: [] }));

    expect(await squadProgress("ghost")).toEqual(ok({ met: ["firebase"], required: [] }));
  });

  it("reads each contact once even when the pair appears twice, and makes no contact reads without contacts", async () => {
    mocks.listFor.mockResolvedValue(ok([contact("ana", "me"), contact("ana", "me")]));
    await squadProgress("me");
    expect(mocks.findByUid.mock.calls.filter(([uid]) => uid === "ana")).toHaveLength(1);

    mocks.findByUid.mockClear();
    mocks.listFor.mockResolvedValue(ok([]));
    expect(await squadProgress("me")).toEqual(ok({ met: [], required: ["firebase", "gemini"] }));
    expect(mocks.findByUid).toHaveBeenCalledTimes(1);
  });

  it("fails when the cadet, the contacts or the squads cannot be read", async () => {
    mocks.listFor.mockResolvedValue(ok([contact("ana", "me")]));

    mocks.squads.mockResolvedValueOnce({ ok: false, error: { code: "x" } });
    expect(await squadProgress("me")).toEqual({ ok: false, error: { code: "unknown" } });

    mocks.listFor.mockResolvedValueOnce({ ok: false, error: { code: "x" } });
    expect(await squadProgress("me")).toEqual({ ok: false, error: { code: "unknown" } });

    mocks.findByUid.mockImplementation(async (uid: string) => (uid === "ana" ? { ok: false, error: { code: "x" } } : ok(cadet(uid, "angular"))));
    expect(await squadProgress("me")).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
