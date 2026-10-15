import { ok, type Result } from "@/shared/lib/result";
import type { SquadCatalog } from "../domain/ports";
import type { Squad } from "../domain/squad";
import type { SquadError } from "../domain/squad-error";
import { angularSprite, firebaseSprite, geminiSprite } from "./squad-sprites";

/**
 * The squads of DevFest 2026 as designed in phase 1. They seed a new edition's catalog (the admin's
 * "create the DevFest squads" button) and serve as the catalog in tests. Ids are stable slugs: they are what
 * the attendee profile stores.
 */
export const STATIC_SQUADS: readonly Squad[] = [
  {
    id: "angular",
    name: "Escuadrón Angular",
    tagline: "Estructura, precisión y componentes sin fin.",
    sprite: angularSprite(),
    active: true,
  },
  {
    id: "firebase",
    name: "Escuadrón Firebase",
    tagline: "Tiempo real y cero servidores que mantener.",
    sprite: firebaseSprite(),
    active: true,
  },
  {
    id: "gemini",
    name: "Escuadrón Gemini",
    tagline: "Inteligencia que se adapta a cada misión.",
    sprite: geminiSprite(),
    active: true,
  },
];

export class StaticSquadCatalog implements SquadCatalog {
  async list(): Promise<Result<readonly Squad[], SquadError>> {
    return ok(STATIC_SQUADS);
  }
}
