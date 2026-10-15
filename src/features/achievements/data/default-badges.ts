import type { Badge } from "../domain/badge";

/**
 * The bundled badges: what an edition offers until the admin loads them as its own (then they can be
 * edited, deactivated or joined by new ones). Only count and level rules, so they work with any edition's
 * missions and quadrants.
 */
export const DEFAULT_BADGES: readonly Badge[] = [
  { id: "primer-salto", name: "Primer salto", description: "Completa tu primera misión.", tone: "cyan", rule: { type: "missions-completed", count: 1 } },
  { id: "explorador", name: "Explorador estelar", description: "Completa 5 misiones.", tone: "lime", rule: { type: "missions-completed", count: 5 } },
  { id: "veterano", name: "Veterano de la flota", description: "Completa 12 misiones.", tone: "gold", rule: { type: "missions-completed", count: 12 } },
  { id: "oyente", name: "Oyente cósmico", description: "Asiste a 3 charlas.", tone: "violet", rule: { type: "talks-attended", count: 3 } },
  { id: "maraton", name: "Maratón de charlas", description: "Asiste a 6 charlas.", tone: "magenta", rule: { type: "talks-attended", count: 6 } },
  { id: "ruta-stands", name: "Ruta de stands", description: "Visita 3 stands.", tone: "cyan", rule: { type: "stands-visited", count: 3 } },
  { id: "alas-piloto", name: "Alas de piloto", description: "Alcanza el nivel 2.", tone: "lime", rule: { type: "level-reached", level: 2 } },
  { id: "comandante", name: "Insignia de comandante", description: "Alcanza el nivel 3.", tone: "gold", rule: { type: "level-reached", level: 3 } },
  { id: "cofre", name: "Cofre de créditos", description: "Gana 50 G-Credits en este evento.", tone: "gold", rule: { type: "credits-earned", count: 50 } },
  { id: "red-estelar", name: "Red estelar", description: "Conecta con 5 cadetes en la Red.", tone: "violet", rule: { type: "contacts-made", count: 5 } },
].map((badge, order) => ({ ...badge, tone: badge.tone as Badge["tone"], rule: badge.rule as Badge["rule"], order, active: true, image: null }));
