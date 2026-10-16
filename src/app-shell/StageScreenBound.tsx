"use client";

import { useState } from "react";
import {
  StageScreen,
  createStageFeed,
  type StageScreenProps,
} from "@/features/leaderboard";
import { LivePollStage } from "@/features/polls";
import { stagePollAction } from "./polls/stage.action";

/**
 * The stage screen bound to its real live feed (Firestore listeners with the admin session of this browser) and, with
 * polls on, to the polls feature for a poll's results. One feed for the life of the screen; it starts listening when
 * the screen mounts.
 */
export function StageScreenBound({
  pollsOn = false,
  ...props
}: Omit<StageScreenProps, "feed" | "renderPoll"> & { pollsOn?: boolean }) {
  const [feed] = useState(createStageFeed);
  return (
    <StageScreen
      {...props}
      feed={feed}
      renderPoll={
        pollsOn
          ? (pollId) => <LivePollStage pollId={pollId} load={stagePollAction} />
          : undefined
      }
    />
  );
}
