"use client";

import { useState } from "react";
import {
  StageScreen,
  createStageFeed,
  type StageScreenProps,
} from "@/features/leaderboard";
import { StageQr } from "@/features/ephemeral-qr";
import { LivePollStage } from "@/features/polls";
import { issueQrAction } from "./ephemeral-qr/issue-qr.action";
import { stagePollAction } from "./polls/stage.action";

/**
 * The stage screen bound to its real live feed (Firestore listeners with the admin session of this browser) and, with
 * polls on, to the polls feature for a poll's results and, with check-ins on, to the ephemeral QR feature for a talk's code. One feed for the life of the screen; it starts listening when
 * the screen mounts.
 */
export function StageScreenBound({
  pollsOn = false,
  talkQrOn = false,
  ...props
}: Omit<StageScreenProps, "feed" | "renderPoll" | "renderTalkQr"> & { pollsOn?: boolean; talkQrOn?: boolean }) {
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
      renderTalkQr={talkQrOn ? ({ talkId, name }) => <StageQr checkpointId={talkId} name={name} issue={issueQrAction} /> : undefined}
    />
  );
}
