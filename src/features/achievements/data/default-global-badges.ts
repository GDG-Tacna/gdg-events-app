import type { GlobalBadge } from "../domain/global-badge";

/**
 * Bundled global community badges offered until a global admin seeds and customizes them in Firestore.
 * Every rule uses cross-edition community signals (events attended, certificates, total badges and lifetime G-Credits).
 */
export const DEFAULT_GLOBAL_BADGES: readonly GlobalBadge[] = [
  {
    id: "primer-evento",
    name: "Primer evento GDG",
    description: "Participa en tu primer evento de GDG Tacna.",
    tone: "cyan",
    rule: { type: "events-attended", count: 1 },
  },
  {
    id: "miembro-recurrente",
    name: "Miembro recurrente",
    description: "Participa en 2 eventos de GDG Tacna.",
    tone: "lime",
    rule: { type: "events-attended", count: 2 },
  },
  {
    id: "veterano-gdg",
    name: "Veterano GDG Tacna",
    description: "Participa en 5 eventos de GDG Tacna.",
    tone: "gold",
    rule: { type: "events-attended", count: 5 },
  },
  {
    id: "certificado-oficial",
    name: "Certificado oficial",
    description: "Obtén tu primer certificado verificado de GDG Tacna.",
    tone: "violet",
    rule: { type: "certificates-earned", count: 1 },
  },
  {
    id: "coleccionista",
    name: "Coleccionista",
    description: "Desbloquea 5 logros en eventos de GDG Tacna.",
    tone: "magenta",
    rule: { type: "total-badges", count: 5 },
  },
  {
    id: "tesoro-comunitario",
    name: "Tesoro comunitario",
    description: "Acumula 100 G-Credits entre eventos de la comunidad.",
    tone: "gold",
    rule: { type: "total-credits", count: 100 },
  },
].map((badge, order) => ({
  ...badge,
  tone: badge.tone as GlobalBadge["tone"],
  rule: badge.rule as GlobalBadge["rule"],
  order,
  active: true,
  image: null,
}));
