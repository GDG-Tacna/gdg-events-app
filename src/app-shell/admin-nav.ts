import type { AdminNavItem } from "@/features/admin";
import type { AccessLevel, AdminSection, EditionModule } from "@/features/event";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import type { IconName } from "@/shared/ui";

/** The menu's groups, in the order the menu shows them. */
export type AdminNavGroup = keyof typeof copy.admin.navGroups;

interface Area {
  href: string;
  label: string;
  icon: IconName;
  card: { title: string; description: string };
  group: AdminNavGroup;
  /** The module it belongs to; an area without one is part of the core and always shows. */
  module?: EditionModule;
  /** The control center section it is (what an edition's permissions give an organizer per area). */
  section: AdminSection;
}

const n = copy.admin.nav;
const a = copy.admin.areas;

/**
 * Every area of the control center, grouped by what it is for: the event itself, its program, the game, squads and
 * prizes, and what runs live on the day. A module adds its area here when it ships, so the menu never links to a
 * screen that is not built yet.
 */
const AREAS: readonly Area[] = [
  { href: ROUTES.adminEvent, label: n.event, icon: "calendar", card: a.event, group: "event", section: "event" },
  { href: ROUTES.adminTeam, label: n.team, icon: "users", card: a.team, group: "event", section: "team" },

  { href: ROUTES.adminTalks, label: n.talks, icon: "mic", card: a.talks, group: "program", section: "talks" },
  { href: ROUTES.adminSpeakers, label: n.speakers, icon: "person", card: a.speakers, group: "program", section: "talks" },
  { href: ROUTES.adminCheckpoints, label: n.checkpoints, icon: "store", card: a.checkpoints, group: "program", section: "checkpoints" },
  { href: ROUTES.adminZones, label: n.zones, icon: "layers", card: a.zones, group: "program", module: "map", section: "map" },
  { href: ROUTES.adminMap, label: n.map, icon: "map", card: a.map, group: "program", module: "map", section: "map" },

  { href: ROUTES.adminMissions, label: n.missions, icon: "target", card: a.missions, group: "game", module: "missions", section: "missions" },
  { href: ROUTES.adminOdyssey, label: n.odyssey, icon: "transmission", card: a.odyssey, group: "game", module: "odyssey", section: "odyssey" },
  { href: ROUTES.adminMinigames, label: n.minigames, icon: "gamepad", card: a.minigames, group: "game", module: "minigames", section: "minigames" },
  { href: ROUTES.adminAchievements, label: n.achievements, icon: "award", card: a.achievements, group: "game", module: "achievements", section: "achievements" },
  { href: ROUTES.adminRanks, label: n.ranks, icon: "medal", card: a.ranks, group: "game", section: "ranks" },

  { href: ROUTES.adminSquads, label: n.squads, icon: "flag", card: a.squads, group: "rewards", module: "squads", section: "squads" },
  { href: ROUTES.adminSquadCredits, label: n.squadCredits, icon: "piggy-bank", card: a.squadCredits, group: "rewards", module: "squads", section: "squadCredits" },
  { href: ROUTES.adminEconomy, label: n.economy, icon: "coins", card: a.economy, group: "rewards", section: "economy" },
  { href: ROUTES.adminRaffle, label: n.raffle, icon: "gift", card: a.raffle, group: "rewards", module: "raffle", section: "raffle" },

  { href: ROUTES.adminStage, label: n.stage, icon: "stage", card: a.stage, group: "live", module: "leaderboard", section: "stage" },
  { href: ROUTES.adminPolls, label: n.polls, icon: "poll", card: a.polls, group: "live", module: "polls", section: "polls" },
];

/** Which modules the edition has on; every one when not given. */
export type ModuleCheck = (module: EditionModule) => boolean;
const allOn: ModuleCheck = () => true;
/** The session's level per section; edit everywhere when not given. */
export type SectionLevels = Partial<Record<AdminSection, AccessLevel>>;

const shown = (isOn: ModuleCheck, levels: SectionLevels) => (area: Area) => (area.module === undefined || isOn(area.module)) && levels[area.section] !== "none";

/** The areas the session may only look at (their screens show without controls). */
export function readOnlyAreas(levels: SectionLevels): string[] {
  return AREAS.filter((area) => levels[area.section] === "view").map((area) => area.href);
}

/** The menu: the home, then each group's areas, minus those of modules switched off or sections the session may not see. */
export function adminNavItems(isOn: ModuleCheck = allOn, levels: SectionLevels = {}): AdminNavItem[] {
  return [
    { href: ROUTES.admin, label: n.home, exact: true, icon: "home" },
    ...AREAS.filter(shown(isOn, levels)).map(({ href, label, icon, group }) => ({ href, label, icon, group: copy.admin.navGroups[group] })),
  ];
}

/** Home shortcuts: the same areas, in the same groups, each with its line icon and what it is for. */
export function adminAreaCards(
  isOn: ModuleCheck = allOn,
  levels: SectionLevels = {},
): Array<{ href: string; icon: IconName; title: string; description: string; group: string }> {
  return AREAS.filter(shown(isOn, levels)).map(({ href, icon, card, group }) => ({ href, icon, ...card, group: copy.admin.navGroups[group] }));
}
