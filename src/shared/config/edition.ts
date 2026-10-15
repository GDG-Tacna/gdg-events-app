/**
 * What changes from one edition of the event to the next. The vocabulary lives in `shared/copy`, the
 * colors in `globals.css` and the squads in their catalog; the rest of the app reads them from there
 * instead of hard-coding the theme.
 */
export const EDITION = {
  /** Used when the database has no `config/app` document yet (first run, local development). */
  defaultEventId: "devfest-2026",
  /**
   * Where the event happens, for the dates admins type and read (DevFest Tacna: Peru, no daylight saving).
   * The offset is fixed on purpose: Peru keeps UTC-5 all year.
   */
  timeZone: "America/Lima",
  utcOffset: "-05:00",
  /**
   * The rank ladder: stable ids (names live in `shared/copy`) and the XP each level starts at. Levels
   * are the position in this list, so gates such as "coffee break needs level 2" survive renaming.
   * Ranks are derived from XP and never stored, so changing this reprices everyone without a migration.
   */
  ranks: [
    { id: "recruit", minXp: 0 },
    { id: "pilot", minXp: 100 },
    { id: "commander", minXp: 500 },
    { id: "stellar-legend", minXp: 2000 },
  ],
} as const;
