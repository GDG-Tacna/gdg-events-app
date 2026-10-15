export const ROUTES = {
  home: "/",
  login: "/login",
  dashboard: "/dashboard",
  onboarding: "/onboarding",
  /** For a staff or organizer whose role is in another edition than the public one: pick where to work, or wait. */
  myEditions: "/mis-eventos",
  /** Squad reveal (optional feature: see `FEATURES.squads`). */
  squad: "/squad",
  /** The cadet's personal QR, scanned by staff at the entrance, the catering and the stands. Attendees only. */
  pass: "/pass",
  /** The jump scanner (camera). Attendees only. */
  scan: "/scan",
  /** The galaxy map: quadrants and the venue plan. Attendees only. */
  map: "/map",
  /** The missions board. Attendees only. */
  missions: "/missions",
  /** The Odisea de Código: transmissions opened by missions. Attendees only. */
  odyssey: "/odyssey",
  /** A mission's mini-game, full screen: `/minigame/{missionId}`. Attendees only. */
  minigame: "/minigame",
  /** The cadet network: the cadet's contact code and card, scanning other cadets, and their contacts. Attendees only. */
  network: "/red",
  /** The stage screen for the projector (phase 6). Admins only. */
  stage: "/escenario",
  /** The attendee's badges (Logros). Attendees only. */
  achievements: "/achievements",
  /** Staff area: pick a serving point and hand out rations. Staff and admin. */
  staff: "/staff",
  /** Admin area (Centro de control). Admin role only. */
  admin: "/admin",
  adminTeam: "/admin/team",
  /** Where a talk's QR is projected (`/admin/qr/{talkId}`); the list itself lives in Charlas. */
  adminQr: "/admin/qr",
  adminTalks: "/admin/charlas",
  adminCheckpoints: "/admin/puestos",
  adminSquads: "/admin/escuadrones",
  adminMissions: "/admin/misiones",
  adminMap: "/admin/mapa",
  adminRanks: "/admin/rangos",
  adminOdyssey: "/admin/odisea",
  adminEconomy: "/admin/economia",
  adminAchievements: "/admin/logros",
  adminSquadCredits: "/admin/creditos-escuadron",
  adminMinigames: "/admin/minijuegos",
  adminStage: "/admin/escenario",
  adminRaffle: "/admin/sorteo",
  adminEvent: "/admin/eventos",
  /** Static fallback page the service worker serves when a navigation fails offline. Never protected. */
  offline: "/offline",
  /** Where a freshly signed-in user lands; the guards send attendees without a profile on to onboarding. */
  afterSignIn: "/dashboard",
} as const;

/** Where each role lands after signing in: attendees on their dashboard, staff on the serving points, admins on the control center. */
export function homeFor(role: "attendee" | "staff" | "organizer" | "admin" | null): string {
  switch (role) {
    case "attendee":
      return ROUTES.dashboard;
    case "staff":
      return ROUTES.staff;
    case "organizer":
    case "admin":
      return ROUTES.admin;
    default:
      // No role yet: the person has not finished registering.
      return ROUTES.onboarding;
  }
}
