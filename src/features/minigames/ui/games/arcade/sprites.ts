import type { Sprite } from "./engine";

/** Pixel art of the action games, drawn at integer scales (design system: crisp, no smoothing). */
const CYAN = "#22d3ee";
const LIME = "#a3e635";
const MAGENTA = "#f472b6";
const ROSE = "#fb7185";
const WHITE = "#f4f6ff";
const VIOLET = "#8b5cf6";
const GOLD = "#fbbf24";
const NAVY = "#111833";

/** The cadet's ship (12 × 8). */
export const SHIP: Sprite = {
  rows: [".....CC.....", ".....CC.....", "....CWWC....", "...CCWWCC...", ".CCCCCCCCCC.", "CCVCCCCCCVCC", "CC.CC..CC.CC", "....RR.RR..."],
  palette: { C: CYAN, W: WHITE, V: VIOLET, R: ROSE },
};

/** A bug of the invading rows (10 × 8), two frames for its legs. */
export const BUG: readonly Sprite[] = [
  { rows: ["..L....L..", "...L..L...", "..MMMMMM..", ".MMWMMWMM.", "MMMMMMMMMM", "M.MMMMMM.M", "M.M....M.M", "...MM.MM.."], palette: { L: LIME, M: MAGENTA, W: WHITE } },
  { rows: ["..L....L..", "M..L..L..M", "M.MMMMMM.M", "MMMWMMWMMM", "MMMMMMMMMM", ".MMMMMMMM.", "..M....M..", ".M......M."], palette: { L: LIME, M: MAGENTA, W: WHITE } },
];

/** The ship's shot (2 × 5) and a bug's "error" (3 × 5). */
export const SHOT: Sprite = { rows: ["CC", "WW", "WW", "CC", "CC"], palette: { C: CYAN, W: WHITE } };
export const ERROR: Sprite = { rows: [".R.", "RRR", ".R.", "RRR", ".R."], palette: { R: ROSE } };

/** The cadet climbing the station (8 × 10). */
export const CADET: Sprite = {
  rows: ["..WWWW..", ".WCCCCW.", ".WCWWCW.", "..CCCC..", ".VVVVVV.", "V.VVVV.V", "..VVVV..", "..V..V..", ".VV..VV.", ".NN..NN."],
  palette: { W: WHITE, C: CYAN, V: VIOLET, N: NAVY },
};

/** A rolling "exception" (8 × 8). */
export const EXCEPTION: Sprite = {
  rows: ["..RRRR..", ".RRWWRR.", "RRRWWRRR", "RRRWWRRR", "RRRRRRRR", "RRRWWRRR", ".RRRRRR.", "..RRRR.."],
  palette: { R: ROSE, W: WHITE },
};

/** Bug Kong, the giant bug at the top (16 × 16). */
export const BUG_KONG: Sprite = {
  rows: [
    "...L........L...",
    "....L......L....",
    ".....MMMMMM.....",
    "...MMMMMMMMMM...",
    "..MMWWMMMMWWMM..",
    "..MMWNMMMMWNMM..",
    ".MMMMMMMMMMMMMM.",
    "MMM.MMMMMMMM.MMM",
    "MM..MMRRRRMM..MM",
    "MM.MMMRRRRMMM.MM",
    "M..MMMMMMMMMM..M",
    "M..MMMMMMMMMM..M",
    "...MMM....MMM...",
    "..MMM......MMM..",
    ".MMM........MMM.",
    "MMM..........MMM",
  ],
  palette: { L: LIME, M: MAGENTA, W: WHITE, N: NAVY, R: ROSE },
};

/** The patch the cadet carries to the top (6 × 6). */
export const PATCH: Sprite = { rows: [".GGGG.", "GGWWGG", "GWGGWG", "GWGGWG", "GGWWGG", ".GGGG."], palette: { G: GOLD, W: WHITE } };

export const COLORS = { girder: VIOLET, girderEdge: "#5b6ab8", ladder: "#5b6ab8", line: ROSE, background: "#050816" };
