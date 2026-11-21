import { leaderboardDeps } from "@/app-shell/composition/leaderboard.server";
import { squadCatalog } from "@/app-shell/composition/squads.server";
import { moduleOn } from "@/app-shell/modules.server";
import { getFleetBoard } from "@/features/leaderboard/server";
import { logServerError } from "@/shared/lib/log";
import { feedDenied, feedError, feedJson, feedPreflight } from "../http";

/**
 * The fleet ranking for the local show: the top cadets (alias, squad, XP) and the squads, the same board the stage
 * screen reads (kept a few seconds per instance, so polling costs almost nothing), with each squad's pixel logo for the
 * projector. No uid or email ever leaves.
 */
export async function GET(request: Request) {
  const denied = feedDenied(request);
  if (denied) return denied;
  try {
    if (!(await moduleOn("leaderboard"))) return feedError("off", 404);
    const [board, squadsOn, catalog] = await Promise.all([getFleetBoard(leaderboardDeps), moduleOn("squads"), squadCatalog.list()]);
    if (!board.ok) {
      logServerError("show-feed.board", new Error("the fleet board could not be read"));
      return feedError("unknown", 500);
    }
    return feedJson({
      cadets: board.value.cadets.map(({ position, alias, squad, xp }) => ({ position, alias, squad, xp })),
      squads: squadsOn
        ? board.value.squads.map(({ position, id, name, xp, members }) => {
            // The logo is decoration: a squad missing from the catalog still ranks, without it.
            const sprite = catalog.ok ? catalog.value.find((squad) => squad.id === id)?.sprite : undefined;
            return { position, name, xp, members, sprite: sprite ? { rows: sprite.rows, palette: sprite.palette } : null };
          })
        : [],
      squadsOn,
    });
  } catch (cause) {
    logServerError("show-feed.board", cause);
    return feedError("unknown", 500);
  }
}

export const OPTIONS = feedPreflight;
