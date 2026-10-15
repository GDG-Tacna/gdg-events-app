/**
 * Feature flags: phases ship progressively, and optional roadmap items can be switched off
 * without removing code. Flags are read on the server and passed down; they are not secrets.
 */
export const FEATURES = {
  /** Phase 1 optional item: random squad assignment (Angular, Cloud, Firebase). */
  squads: true,
  /** Phase 2: QR check-ins (entrance, talks, catering). */
  checkins: true,
  /** Phase 2: the admin area (Centro de Control). */
  admin: true,
  /** Phase 3: the galaxy map (quadrants and venue plan) and its tab. */
  map: true,
  /** Phase 3: missions and the XP they grant, and the Misiones tab. */
  missions: true,
  /** Phase 3: AI mission suggestions in the admin (needs GEMINI_API_KEY on the server). */
  missionSuggestions: true,
  /** Phase 3: the Odisea de Código (transmissions opened by missions). */
  odyssey: true,
  /** Phase 4: achievements (badges) and the Logros tab. */
  achievements: true,
  /** Phase 5: mini-games, a bonus on completed missions (win doubles the XP). */
  minigames: true,
  /** Phase 5: the cadet network (contact codes, cards with opt-in links, rewards per new contact) and its Red screen. */
  network: true,
  /** Phase 6: the fleet ranking (cadets by XP, squads by their members' XP), in the app and on the stage screen. */
  leaderboard: true,
  /** Phase 6: the final swag raffle (G-Credits earned in the edition are tickets), drawn on the stage. */
  raffle: true,
} as const;

export type FeatureName = keyof typeof FEATURES;
