import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { EDITION_MODULES, isEditionModule, type EditionModule, type ModuleSwitches } from "@/features/event/server";
import { FEATURES, type FeatureName } from "@/shared/config/features";
import { logServerError } from "@/shared/lib/log";
import { editionModules } from "./composition/event.server";

/** The request's edition modules, read once per request. A failed read is logged and answered as "unknown". */
const switches = cache(async (): Promise<ModuleSwitches | null> => {
  // The answer depends on the request (its edition), never on the build: render on request.
  await connection();
  const read = await editionModules();
  if (read.ok) return read.value;
  logServerError("modules.read", new Error("the edition's modules could not be read"));
  return null;
});

/**
 * Whether a part of the app is on for the request's edition: the code's flag is the ceiling, and an edition can
 * switch its modules off (Eventos › Módulos). Pages, actions and navigation ask this instead of the flag. A failed
 * read never hides a module: the code's flag decides then.
 */
export async function moduleOn(name: FeatureName): Promise<boolean> {
  if (!FEATURES[name]) return false;
  if (!isEditionModule(name)) return true;
  const on = await switches();
  return on ? on[name] : true;
}

/** Every edition module with whether it is on, for screens that show or hide several areas at once. */
export async function moduleSwitches(): Promise<Record<EditionModule, boolean>> {
  const answers = await Promise.all(EDITION_MODULES.map((module) => moduleOn(module)));
  return Object.fromEntries(EDITION_MODULES.map((module, index) => [module, answers[index]])) as Record<EditionModule, boolean>;
}
