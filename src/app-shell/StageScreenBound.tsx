"use client";

import { useState } from "react";
import { StageScreen, createStageFeed, type StageScreenProps } from "@/features/leaderboard";

/**
 * The stage screen bound to its real live feed (Firestore listeners with the admin session of this browser). One
 * feed for the life of the screen; it starts listening when the screen mounts.
 */
export function StageScreenBound(props: Omit<StageScreenProps, "feed">) {
  const [feed] = useState(createStageFeed);
  return <StageScreen {...props} feed={feed} />;
}
