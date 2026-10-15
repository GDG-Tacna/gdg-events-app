import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";

/** The mission types credits are set for (the missions feature owns them; the names are the contract). */
export const CREDIT_MISSION_TYPES = ["talk", "stand", "quiz", "keyword"] as const;
export type CreditMissionType = (typeof CREDIT_MISSION_TYPES)[number];

export const CREDITS_MAX = 1000;
export const SQUAD_RATIO_MAX = 10;
export const CONTACT_XP_MAX = 500;
export const CONTACT_CAP_MAX = 200;

/** How the economy works in one edition. Switching a currency off stops new grants; nothing earned is removed. */
export interface EconomySettings {
  creditsEnabled: boolean;
  /** G-Credits a mission of each type gives when the mission does not set its own. */
  missionCredits: Record<CreditMissionType, number>;
  /** G-Credits for attending a talk (scanning its code on screen). */
  talkCredits: number;
  squadCreditsEnabled: boolean;
  /** Squad credits a squad earns per G-Credit one of its members earns (rounded down). */
  squadRatio: number;
  /** XP each cadet earns for a new contact in the cadet network (phase 5). */
  contactXp: number;
  /** G-Credits each cadet earns for a new contact (none while credits are off). */
  contactCredits: number;
  /** How many contacts per cadet pay a reward in this edition; more can be made, they just pay nothing. */
  contactCap: number;
}

export const DEFAULT_ECONOMY: EconomySettings = {
  creditsEnabled: true,
  missionCredits: { talk: 10, stand: 10, quiz: 5, keyword: 5 },
  talkCredits: 10,
  squadCreditsEnabled: true,
  squadRatio: 1,
  contactXp: 20,
  contactCredits: 5,
  contactCap: 10,
};

const isWhole = (value: unknown, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export type EconomyErrorCode = "invalid-settings" | "unauthenticated" | "forbidden" | "disabled" | "unknown";

/**
 * Reads settings from stored or admin-submitted data; `null` when any value is out of range. The contact values
 * came later (phase 5): settings saved before them read with their defaults.
 */
export function parseEconomySettings(input: unknown): EconomySettings | null {
  if (!isRecord(input) || !isRecord(input.missionCredits)) return null;
  const { creditsEnabled, talkCredits, squadCreditsEnabled, squadRatio, missionCredits } = input;
  if (typeof creditsEnabled !== "boolean" || typeof squadCreditsEnabled !== "boolean") return null;
  if (!isWhole(talkCredits, CREDITS_MAX)) return null;
  if (typeof squadRatio !== "number" || !Number.isFinite(squadRatio) || squadRatio < 0 || squadRatio > SQUAD_RATIO_MAX) return null;
  const credits = {} as Record<CreditMissionType, number>;
  for (const type of CREDIT_MISSION_TYPES) {
    const value = missionCredits[type];
    if (!isWhole(value, CREDITS_MAX)) return null;
    credits[type] = value;
  }
  const contactXp = input.contactXp ?? DEFAULT_ECONOMY.contactXp;
  const contactCredits = input.contactCredits ?? DEFAULT_ECONOMY.contactCredits;
  const contactCap = input.contactCap ?? DEFAULT_ECONOMY.contactCap;
  if (!isWhole(contactXp, CONTACT_XP_MAX) || !isWhole(contactCredits, CREDITS_MAX) || !isWhole(contactCap, CONTACT_CAP_MAX)) return null;
  // Two decimals are enough for a ratio (0.5 or 1.25), and keep stored values tidy.
  return {
    creditsEnabled,
    missionCredits: credits,
    talkCredits,
    squadCreditsEnabled,
    squadRatio: Math.round(squadRatio * 100) / 100,
    contactXp,
    contactCredits,
    contactCap,
  };
}

export interface EconomyStore {
  /** The edition's settings, or `null` while it has none (or they cannot be used). */
  load(): Promise<Result<EconomySettings | null, { code: string }>>;
  save(settings: EconomySettings): Promise<Result<void, { code: string }>>;
}

export interface EconomyDeps {
  store: EconomyStore;
}

export interface EconomyAdminDeps extends EconomyDeps {
  audit: { append(entry: { action: "economy.updated"; actorUid: string; targetUid: string; details: Record<string, string | null>; at: Date }): Promise<Result<void, { code: string }>> };
  now: () => Date;
}

/** The settings that rule this edition. Never fails: a failed read is logged and the defaults rule. */
export async function getEconomySettings(deps: EconomyDeps): Promise<EconomySettings> {
  const loaded = await deps.store.load();
  if (!loaded.ok) {
    logServerError("economy.settings.load", new Error(loaded.error.code));
    return DEFAULT_ECONOMY;
  }
  return loaded.value ?? DEFAULT_ECONOMY;
}

export async function getEconomyForEdit(
  deps: EconomyDeps,
  actor: { role: "attendee" | "staff" | "admin" | null },
): Promise<Result<{ settings: EconomySettings; isDefault: boolean }, { code: EconomyErrorCode }>> {
  if (actor.role !== "admin") return err({ code: "forbidden" });
  const loaded = await deps.store.load();
  if (!loaded.ok) return err({ code: "unknown" });
  return ok({ settings: loaded.value ?? DEFAULT_ECONOMY, isDefault: loaded.value === null });
}

export async function saveEconomySettings(
  deps: EconomyAdminDeps,
  actor: { uid: string; role: "attendee" | "staff" | "admin" | null },
  input: unknown,
): Promise<Result<EconomySettings, { code: EconomyErrorCode }>> {
  if (actor.role !== "admin") return err({ code: "forbidden" });
  const settings = parseEconomySettings(input);
  if (!settings) return err({ code: "invalid-settings" });
  const saved = await deps.store.save(settings);
  if (!saved.ok) return err({ code: "unknown" });

  const written = await deps.audit.append({
    action: "economy.updated",
    actorUid: actor.uid,
    targetUid: "economy",
    details: {
      credits: settings.creditsEnabled ? "on" : "off",
      missionCredits: CREDIT_MISSION_TYPES.map((type) => `${type}:${settings.missionCredits[type]}`).join(","),
      talkCredits: String(settings.talkCredits),
      squadCredits: settings.squadCreditsEnabled ? `on x${settings.squadRatio}` : "off",
      contacts: `xp:${settings.contactXp},credits:${settings.contactCredits},cap:${settings.contactCap}`,
    },
    at: deps.now(),
  });
  if (!written.ok) logServerError("economy.audit.append", new Error("audit entry missing for economy"));
  return ok(settings);
}

/** What a new contact pays each cadet under these settings, and up to how many contacts. */
export function contactRewardFor(settings: EconomySettings): { xp: number; credits: number; cap: number } {
  return { xp: settings.contactXp, credits: settings.creditsEnabled ? settings.contactCredits : 0, cap: settings.contactCap };
}

/** G-Credits a mission gives under these settings: its own value, or the type's default; none when credits are off. */
export function missionCreditsFor(settings: EconomySettings, type: string, own: number | null): number {
  if (!settings.creditsEnabled) return 0;
  if (own !== null) return own;
  return (CREDIT_MISSION_TYPES as readonly string[]).includes(type) ? settings.missionCredits[type as CreditMissionType] : 0;
}
