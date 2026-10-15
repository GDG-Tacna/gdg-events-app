import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { EditionsActor, EditionsAuditEntry } from "./editions";

/**
 * The parts of the app an edition can switch off (a small meetup may not want the raffle or the network). The code's
 * feature flags stay the ceiling: a module the code has off is off everywhere. Check-ins, the staff checkpoints and
 * the control center are the core and cannot be switched off; G-Credits are switched in Economía.
 */
export const EDITION_MODULES = ["squads", "map", "missions", "odyssey", "achievements", "minigames", "network", "leaderboard", "raffle"] as const;
export type EditionModule = (typeof EDITION_MODULES)[number];

export const isEditionModule = (value: unknown): value is EditionModule => typeof value === "string" && (EDITION_MODULES as readonly string[]).includes(value);

/** What a module cannot work without: switching that off switches it off too. */
export const MODULE_NEEDS: Readonly<Record<EditionModule, readonly EditionModule[]>> = {
  squads: [],
  map: [],
  missions: [],
  odyssey: ["missions"],
  achievements: [],
  minigames: ["missions"],
  network: [],
  leaderboard: [],
  raffle: [],
};

export type ModuleSwitches = Readonly<Record<EditionModule, boolean>>;

/** Every module on, except the ones stored off and the ones that need a module that is off. */
export function effectiveModules(off: readonly EditionModule[]): ModuleSwitches {
  const stored = new Set(off);
  const on = (module: EditionModule): boolean => !stored.has(module) && MODULE_NEEDS[module].every(on);
  return Object.fromEntries(EDITION_MODULES.map((module) => [module, on(module)])) as unknown as ModuleSwitches;
}

/** A stored list of switched-off modules, keeping only known names (an unknown or broken one reads as nothing off). */
export function parseOffModules(data: unknown): EditionModule[] {
  const off = (data as { off?: unknown } | undefined)?.off;
  return Array.isArray(off) ? EDITION_MODULES.filter((module) => off.includes(module)) : [];
}

export interface ModuleStore {
  /** The modules switched off in the request's edition (none until an admin switches one off). */
  readOff(): Promise<Result<readonly EditionModule[], { code: string }>>;
  saveOff(off: readonly EditionModule[]): Promise<Result<void, { code: string }>>;
}

export interface ModuleDeps {
  store: ModuleStore;
  audit: { append(entry: Omit<EditionsAuditEntry, "action"> & { action: "event.modules" }): Promise<Result<void, { code: string }>> };
  now: () => Date;
}

export type ModulesErrorCode = "invalid-modules" | "forbidden" | "unauthenticated" | "disabled" | "unknown";

/** Which modules the request's edition has on. */
export async function getEditionModules(deps: Pick<ModuleDeps, "store">): Promise<Result<ModuleSwitches, { code: "unknown" }>> {
  const off = await deps.store.readOff();
  return off.ok ? ok(effectiveModules(off.value)) : err({ code: "unknown" });
}

/** The modules an admin switched off in the request's edition (without the ones off only because of another). */
export async function listOffModules(deps: Pick<ModuleDeps, "store">): Promise<Result<readonly EditionModule[], { code: "unknown" }>> {
  const off = await deps.store.readOff();
  return off.ok ? ok(off.value) : err({ code: "unknown" });
}

/** Saves which modules the edition has off. Only an admin of every edition decides what an edition offers. */
export async function setEditionModules(
  deps: ModuleDeps,
  actor: EditionsActor,
  input: { off: readonly unknown[]; eventId: string },
): Promise<Result<ModuleSwitches, { code: ModulesErrorCode }>> {
  if (actor.role !== "admin" || actor.adminScope !== "global") return err({ code: "forbidden" });
  if (!input.off.every(isEditionModule)) return err({ code: "invalid-modules" });
  const off = EDITION_MODULES.filter((module) => input.off.includes(module));

  const before = await deps.store.readOff();
  if (!before.ok) return err({ code: "unknown" });
  const saved = await deps.store.saveOff(off);
  if (!saved.ok) return err({ code: "unknown" });

  if (before.value.join(",") !== off.join(",")) {
    const written = await deps.audit.append({ action: "event.modules", actorUid: actor.uid, targetUid: input.eventId, details: { off: off.join(",") || null, previous: before.value.join(",") || null }, at: deps.now() });
    if (!written.ok) logServerError("event.audit.append", new Error(`audit entry missing for the modules of ${input.eventId}`));
  }
  return ok(effectiveModules(off));
}
