import { stageDeps } from "@/app-shell/composition/leaderboard.server";
import { raffleDeps } from "@/app-shell/composition/raffle.server";
import { moduleOn } from "@/app-shell/modules.server";
import { getStage } from "@/features/leaderboard/server";
import { feedDraws } from "@/features/show-feed/server";
import { FEATURES } from "@/shared/config/features";
import { logServerError } from "@/shared/lib/log";
import { feedDenied, feedError, feedJson, feedPreflight } from "../http";

/**
 * The raffle's winners for the local show, newest first. The draw is made in the app's admin (Sorteo); the show only
 * projects it, spinning through the same names the app's stage used for the latest one.
 */
export async function GET(request: Request) {
  const denied = feedDenied(request);
  if (denied) return denied;
  try {
    if (!FEATURES.raffle || !(await moduleOn("raffle"))) return feedError("off", 404);
    const [draws, prizes, squads, stage] = await Promise.all([raffleDeps.store.draws(), raffleDeps.store.prizes(), stageDeps.squads.list(), getStage(stageDeps)]);
    if (!draws.ok) {
      logServerError("show-feed.raffle", new Error("the raffle draws could not be read"));
      return feedError("unknown", 500);
    }
    // Prize photos, squad names and the reel are decoration: without them the winners still show.
    const staged = stage.ok && stage.value.raffle ? { drawId: stage.value.raffle.drawId, reel: stage.value.raffle.reel } : null;
    return feedJson({ draws: feedDraws(draws.value, prizes.ok ? prizes.value : [], squads.ok ? squads.value : [], staged) });
  } catch (cause) {
    logServerError("show-feed.raffle", cause);
    return feedError("unknown", 500);
  }
}

export const OPTIONS = feedPreflight;
