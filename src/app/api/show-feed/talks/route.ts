import { talkQrDeps } from "@/app-shell/composition/show-feed.server";
import { feedTalks } from "@/features/show-feed/server";
import { logServerError } from "@/shared/lib/log";
import { feedDenied, feedError, feedJson, feedPreflight } from "../http";

/** The edition's talks for the local show: their ids (to name them in its rundown), schedule and whether their code is out now. */
export async function GET(request: Request) {
  const denied = feedDenied(request);
  if (denied) return denied;
  try {
    const talks = await talkQrDeps.talks();
    if (!talks.ok) {
      logServerError("show-feed.talks", new Error("the talks could not be read"));
      return feedError("unknown", 500);
    }
    return feedJson({ talks: feedTalks(talks.value) });
  } catch (cause) {
    logServerError("show-feed.talks", cause);
    return feedError("unknown", 500);
  }
}

export const OPTIONS = feedPreflight;
