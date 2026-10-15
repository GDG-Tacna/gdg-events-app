import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ findByUid: vi.fn(), squads: vi.fn(), economy: vi.fn() }));
vi.mock("./attendee.server", () => ({ attendeeDeps: { attendees: { findByUid: mocks.findByUid } } }));
vi.mock("./squads.server", () => ({ squadCatalog: { list: mocks.squads } }));
vi.mock("./economy.server", () => ({ currentEconomy: mocks.economy, rewardLedger: { marker: "ledger" } }));
vi.mock("./qr-signer.server", () => ({ qrSigner: { marker: "signer" } }));
vi.mock("@/features/ephemeral-qr/server", () => ({ QrCodeEncoder: class {} }));
vi.mock("@/features/network/server", () => ({ FirestoreNetworkStore: class {} }));
vi.mock("@/features/economy/server", async () => {
  const settings = await import("@/features/economy/domain/settings");
  return { contactRewardFor: settings.contactRewardFor };
});

const { cadetDirectory, networkDeps } = await import("./network.server");
const { DEFAULT_ECONOMY } = await import("@/features/economy/domain/settings");

const ok = <T,>(value: T) => ({ ok: true as const, value });
const attendee = (uid: string, extra: Record<string, unknown> = {}) => ({ uid, alias: `Alias ${uid}`, role: "attendee", squad: null, ...extra });

describe("cadetDirectory", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.squads.mockResolvedValue(ok([{ id: "firebase", name: "Firebase" }]));
    mocks.findByUid.mockImplementation(async (uid: string) =>
      ok(uid === "u-ana" ? attendee(uid, { squad: "firebase" }) : uid === "u-old" ? attendee(uid, { squad: "retired" }) : uid === "u-staff" ? attendee(uid, { role: "staff" }) : null),
    );
  });

  it("answers each registered attendee's alias and squad name, once per uid", async () => {
    const profiles = await cadetDirectory.profiles(["u-ana", "u-old", "u-ana"]);

    expect(profiles).toEqual(
      ok(
        new Map([
          ["u-ana", { alias: "Alias u-ana", squad: "Firebase" }],
          ["u-old", { alias: "Alias u-old", squad: null }],
        ]),
      ),
    );
    expect(mocks.findByUid).toHaveBeenCalledTimes(2);
  });

  it("leaves out staff and anyone not registered in this edition", async () => {
    expect(await cadetDirectory.profiles(["u-staff", "u-ghost"])).toEqual(ok(new Map()));
  });

  it("shows no squad when the squads cannot be read, and fails when a cadet cannot be", async () => {
    mocks.squads.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await cadetDirectory.profiles(["u-ana"])).toEqual(ok(new Map([["u-ana", { alias: "Alias u-ana", squad: null }]])));

    mocks.findByUid.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await cadetDirectory.profiles(["u-ana"])).toEqual({ ok: false, error: { code: "unknown" } });
  });
});

describe("networkDeps", () => {
  it("rewards contacts as Economía says, through the reward ledger", async () => {
    mocks.economy.mockResolvedValue({ ...DEFAULT_ECONOMY, creditsEnabled: false, contactXp: 25, contactCap: 7 });

    expect(await networkDeps.reward()).toEqual({ xp: 25, credits: 0, cap: 7 });
    expect(networkDeps.ledger).toEqual({ marker: "ledger" });
    expect(networkDeps.signer).toEqual({ marker: "signer" });
  });
});
