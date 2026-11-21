import { pollStore } from "@/app-shell/composition/polls.server";
import { moduleOn } from "@/app-shell/modules.server";
import { feedPoll, feedPolls } from "@/features/show-feed/server";
import { FEATURES } from "@/shared/config/features";
import { logServerError } from "@/shared/lib/log";
import { feedDenied, feedError, feedJson, feedPreflight } from "../http";

const POLL_ID = /^[a-z0-9][a-z0-9-]{3,47}$/;

/**
 * The edition's polls for the local show. Without `?id=`, the ones it may project (open first, then closed); with it,
 * that poll's results (each option's votes and the total), which the show asks every few seconds while on screen.
 */
export async function GET(request: Request) {
  const denied = feedDenied(request);
  if (denied) return denied;
  try {
    if (!FEATURES.polls || !(await moduleOn("polls"))) return feedError("off", 404);
    const listed = await pollStore.list();
    if (!listed.ok) {
      logServerError("show-feed.polls", new Error("the polls could not be read"));
      return feedError("unknown", 500);
    }
    const id = new URL(request.url).searchParams.get("id");
    if (id === null) return feedJson({ polls: feedPolls(listed.value) });

    const poll = POLL_ID.test(id) ? listed.value.find((candidate) => candidate.id === id) : undefined;
    if (!poll || poll.status === "draft") return feedError("not-found", 404);
    const tally = await pollStore.tally(poll.id);
    if (!tally.ok) {
      logServerError("show-feed.polls", new Error("the poll's votes could not be counted"));
      return feedError("unknown", 500);
    }
    return feedJson({ poll: feedPoll({ ...poll, status: poll.status }, tally.value) });
  } catch (cause) {
    logServerError("show-feed.polls", cause);
    return feedError("unknown", 500);
  }
}

export const OPTIONS = feedPreflight;
