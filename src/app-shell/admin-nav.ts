import type { AdminNavItem } from "@/features/admin";
import type { AccessLevel, AdminSection, EditionModule } from "@/features/event";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import type { IconName } from "@/shared/ui";

/** The module each admin area belongs to; an area without one is part of the core and always shows. */
const AREA_MODULE: Partial<Record<string, EditionModule>> = {
  [ROUTES.adminMissions]: "missions",
  [ROUTES.adminMap]: "map",
  [ROUTES.adminOdyssey]: "odyssey",
  [ROUTES.adminAchievements]: "achievements",
  [ROUTES.adminMinigames]: "minigames",
  [ROUTES.adminSquads]: "squads",
  [ROUTES.adminSquadCredits]: "squads",
  [ROUTES.adminStage]: "leaderboard",
  [ROUTES.adminRaffle]: "raffle",
};

/** The control center section each area is (what an edition's permissions give an organizer per area). */
const AREA_SECTION: Partial<Record<string, AdminSection>> = {
  [ROUTES.adminCheckpoints]: "checkpoints",
  [ROUTES.adminTalks]: "talks",
  [ROUTES.adminMissions]: "missions",
  [ROUTES.adminMap]: "map",
  [ROUTES.adminRanks]: "ranks",
  [ROUTES.adminOdyssey]: "odyssey",
  [ROUTES.adminAchievements]: "achievements",
  [ROUTES.adminMinigames]: "minigames",
  [ROUTES.adminEconomy]: "economy",
  [ROUTES.adminSquads]: "squads",
  [ROUTES.adminSquadCredits]: "squadCredits",
  [ROUTES.adminStage]: "stage",
  [ROUTES.adminRaffle]: "raffle",
  [ROUTES.adminTeam]: "team",
  [ROUTES.adminEvent]: "event",
};

/** Which modules the edition has on; every one when not given. */
export type ModuleCheck = (module: EditionModule) => boolean;
const allOn: ModuleCheck = () => true;
/** The session's level per section; edit everywhere when not given. */
export type SectionLevels = Partial<Record<AdminSection, AccessLevel>>;

const shown = (isOn: ModuleCheck, levels: SectionLevels) => (area: { href: string }) => {
  const owner = AREA_MODULE[area.href];
  const section = AREA_SECTION[area.href];
  return (owner === undefined || isOn(owner)) && (section === undefined || levels[section] !== "none");
};

/** The areas the session may only look at (their screens show without controls). */
export function readOnlyAreas(levels: SectionLevels): string[] {
  return Object.entries(AREA_SECTION)
    .filter(([, section]) => section !== undefined && levels[section] === "view")
    .map(([href]) => href);
}

/**
 * The areas of the admin that exist today, in order, minus those of modules the edition has switched off. A module
 * adds its entry here when it ships, so the navigation never links to a screen that is not built yet.
 */
export function adminNavItems(isOn: ModuleCheck = allOn, levels: SectionLevels = {}): AdminNavItem[] {
  return ([
    { href: ROUTES.admin, label: copy.admin.nav.home, exact: true },
    { href: ROUTES.adminCheckpoints, label: copy.admin.nav.checkpoints },
    { href: ROUTES.adminTalks, label: copy.admin.nav.talks },
    { href: ROUTES.adminMissions, label: copy.admin.nav.missions },
    { href: ROUTES.adminMap, label: copy.admin.nav.map },
    { href: ROUTES.adminRanks, label: copy.admin.nav.ranks },
    { href: ROUTES.adminOdyssey, label: copy.admin.nav.odyssey },
    { href: ROUTES.adminAchievements, label: copy.admin.nav.achievements },
    { href: ROUTES.adminMinigames, label: copy.admin.nav.minigames },
    { href: ROUTES.adminEconomy, label: copy.admin.nav.economy },
    { href: ROUTES.adminSquads, label: copy.admin.nav.squads },
    { href: ROUTES.adminSquadCredits, label: copy.admin.nav.squadCredits },
    { href: ROUTES.adminStage, label: copy.admin.nav.stage },
    { href: ROUTES.adminRaffle, label: copy.admin.nav.raffle },
    { href: ROUTES.adminTeam, label: copy.admin.nav.team },
    { href: ROUTES.adminEvent, label: copy.admin.nav.event },
  ] satisfies AdminNavItem[]).filter(shown(isOn, levels));
}

/** Home shortcuts: the same areas, minus the home itself, each with its line icon and what it is for. */
export function adminAreaCards(isOn: ModuleCheck = allOn, levels: SectionLevels = {}): Array<{ href: string; icon: IconName; title: string; description: string }> {
  return ([
    { href: ROUTES.adminCheckpoints, icon: "store", ...copy.admin.areas.checkpoints },
    { href: ROUTES.adminTalks, icon: "mic", ...copy.admin.areas.talks },
    { href: ROUTES.adminMissions, icon: "target", ...copy.admin.areas.missions },
    { href: ROUTES.adminMap, icon: "map", ...copy.admin.areas.map },
    { href: ROUTES.adminRanks, icon: "medal", ...copy.admin.areas.ranks },
    { href: ROUTES.adminOdyssey, icon: "transmission", ...copy.admin.areas.odyssey },
    { href: ROUTES.adminAchievements, icon: "award", ...copy.admin.areas.achievements },
    { href: ROUTES.adminMinigames, icon: "gamepad", ...copy.admin.areas.minigames },
    { href: ROUTES.adminEconomy, icon: "coins", ...copy.admin.areas.economy },
    { href: ROUTES.adminSquads, icon: "flag", ...copy.admin.areas.squads },
    { href: ROUTES.adminSquadCredits, icon: "piggy-bank", ...copy.admin.areas.squadCredits },
    { href: ROUTES.adminStage, icon: "stage", ...copy.admin.areas.stage },
    { href: ROUTES.adminRaffle, icon: "gift", ...copy.admin.areas.raffle },
    { href: ROUTES.adminTeam, icon: "users", ...copy.admin.areas.team },
    { href: ROUTES.adminEvent, icon: "calendar", ...copy.admin.areas.event },
  ] satisfies Array<{ href: string; icon: IconName; title: string; description: string }>).filter(shown(isOn, levels));
}
