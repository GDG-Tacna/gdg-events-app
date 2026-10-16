import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { rewardTalk } from "./rewards";
import {
  DEFAULT_ECONOMY,
  getEconomyForEdit,
  getEconomySettings,
  contactRewardFor,
  missionCreditsFor,
  parseEconomySettings,
  saveEconomySettings,
  type EconomySettings,
} from "./settings";
import type { XpGrantOutcome } from "./xp";

const OWN: EconomySettings = { creditsEnabled: true, missionCredits: { talk: 20, stand: 15, speaker: 12, quiz: 3, keyword: 4 }, talkCredits: 8, squadCreditsEnabled: false, squadRatio: 0.5, contactXp: 15, contactCredits: 3, contactCap: 8 };
const ADMIN = { uid: "a1", role: "admin" } as const;

function store(saved: EconomySettings | null = null) {
  return {
    load: vi.fn(async (): Promise<Result<EconomySettings | null, { code: string }>> => ok(saved)),
    save: vi.fn(async (): Promise<Result<void, { code: string }>> => ok(undefined)),
  };
}

describe("economy settings", () => {
  it("reads settings in range, rounding the ratio to two decimals", () => {
    expect(parseEconomySettings({ ...OWN, squadRatio: 0.333 })).toEqual({ ...OWN, squadRatio: 0.33 });
  });

  it.each([
    ["no mission credits", { ...OWN, missionCredits: undefined }],
    ["a missing type", { ...OWN, missionCredits: { talk: 1, stand: 1, quiz: 1 } }],
    ["negative credits", { ...OWN, talkCredits: -1 }],
    ["too many credits", { ...OWN, missionCredits: { ...OWN.missionCredits, quiz: 1001 } }],
    ["fractional credits", { ...OWN, talkCredits: 1.5 }],
    ["a ratio too high", { ...OWN, squadRatio: 11 }],
    ["a negative ratio", { ...OWN, squadRatio: -0.1 }],
    ["a switch that is not a yes or no", { ...OWN, creditsEnabled: "yes" }],
    ["too much XP per contact", { ...OWN, contactXp: 501 }],
    ["fractional contact credits", { ...OWN, contactCredits: 2.5 }],
    ["a cap too high", { ...OWN, contactCap: 201 }],
    ["a negative cap", { ...OWN, contactCap: -1 }],
  ])("refuses %s", (_, input) => {
    expect(parseEconomySettings(input)).toBeNull();
  });

  it("reads settings saved before the cadet network with the default contact rewards", () => {
    const older: Partial<EconomySettings> = { ...OWN };
    delete older.contactXp;
    delete older.contactCredits;
    delete older.contactCap;

    expect(parseEconomySettings(older)).toEqual({ ...OWN, contactXp: 20, contactCredits: 5, contactCap: 10 });
  });

  it("reads settings saved before speaker missions with their default credits", () => {
    const older: Partial<EconomySettings["missionCredits"]> = { ...OWN.missionCredits };
    delete older.speaker;

    expect(parseEconomySettings({ ...OWN, missionCredits: older })).toEqual({ ...OWN, missionCredits: { ...OWN.missionCredits, speaker: 10 } });
  });

  it("pays contacts their XP and, only while credits are on, their G-Credits, up to the cap", () => {
    expect(contactRewardFor(OWN)).toEqual({ xp: 15, credits: 3, cap: 8 });
    expect(contactRewardFor({ ...OWN, creditsEnabled: false })).toEqual({ xp: 15, credits: 0, cap: 8 });
  });

  it("rules with the edition's settings, or the defaults when there are none or the read fails", async () => {
    expect(await getEconomySettings({ store: store(OWN) })).toEqual(OWN);
    expect(await getEconomySettings({ store: store(null) })).toEqual(DEFAULT_ECONOMY);

    const broken = store();
    broken.load.mockResolvedValue(err({ code: "x" }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await getEconomySettings({ store: broken })).toEqual(DEFAULT_ECONOMY);
  });

  it("offers them to edit, saying whether they are the defaults", async () => {
    expect(await getEconomyForEdit({ store: store(null) }, ADMIN)).toEqual(ok({ settings: DEFAULT_ECONOMY, isDefault: true }));
    expect(await getEconomyForEdit({ store: store(OWN) }, ADMIN)).toEqual(ok({ settings: OWN, isDefault: false }));
    expect(await getEconomyForEdit({ store: store(OWN) }, { role: "staff" })).toEqual(err({ code: "forbidden" }));
  });

  it("saves valid settings, audits them, and refuses invalid ones or anyone but an admin", async () => {
    const saved = store();
    const audit = { append: vi.fn(async () => ok(undefined)) };
    const deps = { store: saved, audit, now: () => new Date(0) };

    expect(await saveEconomySettings(deps, ADMIN, OWN)).toEqual(ok(OWN));
    expect(saved.save).toHaveBeenCalledWith(OWN);
    expect(audit.append).toHaveBeenCalledWith({
      action: "economy.updated",
      actorUid: "a1",
      targetUid: "economy",
      details: { credits: "on", missionCredits: "talk:20,stand:15,speaker:12,quiz:3,keyword:4", talkCredits: "8", squadCredits: "off", contacts: "xp:15,credits:3,cap:8" },
      at: new Date(0),
    });

    expect(await saveEconomySettings(deps, ADMIN, { ...OWN, talkCredits: -1 })).toEqual(err({ code: "invalid-settings" }));
    expect(await saveEconomySettings(deps, { uid: "s1", role: "staff" }, OWN)).toEqual(err({ code: "forbidden" }));
    saved.save.mockResolvedValueOnce(err({ code: "x" }));
    expect(await saveEconomySettings(deps, ADMIN, OWN)).toEqual(err({ code: "unknown" }));
  });

  it("gives a mission its own credits, else its type's default, and none when credits are off", () => {
    expect(missionCreditsFor(OWN, "stand", null)).toBe(15);
    expect(missionCreditsFor(OWN, "stand", 40)).toBe(40);
    expect(missionCreditsFor(OWN, "stand", 0)).toBe(0);
    expect(missionCreditsFor(OWN, "dance", null)).toBe(0);
    expect(missionCreditsFor({ ...OWN, creditsEnabled: false }, "stand", 40)).toBe(0);
  });
});

describe("rewardTalk", () => {
  const ledger = (granted = true) => ({
    grant: vi.fn(async (): Promise<Result<XpGrantOutcome, { code: "not-registered" | "invalid-amount" | "insufficient" | "unknown" }>> => ok({ granted, total: 0, balance: 10 })),
  });

  it("pays the talk's credits once, and says how many this scan earned", async () => {
    const paying = ledger(true);
    expect(await rewardTalk({ ledger: paying, settings: async () => OWN }, "u1", "talk-keynote")).toEqual(ok({ credits: 8 }));
    expect(paying.grant).toHaveBeenCalledWith({ uid: "u1", source: "talk:talk-keynote", xp: 0, credits: 8 });

    expect(await rewardTalk({ ledger: ledger(false), settings: async () => OWN }, "u1", "talk-keynote")).toEqual(ok({ credits: 0 }));
  });

  it("pays nothing when credits are off or a talk gives none, and never fails the scan", async () => {
    const unused = ledger();
    expect(await rewardTalk({ ledger: unused, settings: async () => ({ ...OWN, creditsEnabled: false }) }, "u1", "t1")).toEqual(ok({ credits: 0 }));
    expect(await rewardTalk({ ledger: unused, settings: async () => ({ ...OWN, talkCredits: 0 }) }, "u1", "t1")).toEqual(ok({ credits: 0 }));
    expect(unused.grant).not.toHaveBeenCalled();

    const failing = ledger();
    failing.grant.mockResolvedValue(err({ code: "unknown" }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await rewardTalk({ ledger: failing, settings: async () => OWN }, "u1", "t1")).toEqual(ok({ credits: 0 }));
  });
});
