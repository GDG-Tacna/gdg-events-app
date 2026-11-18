/**
 * When each step of the result screen starts, in seconds: the icon and message first, then the missions stamping one
 * after another, then the XP counting up while the bar fills, then (only if the cadet went up a rank) the rank, and last
 * the badges. Steps that do not exist take no time, so a plain scan is quick and a big one runs about two and a half
 * seconds. Pure, so the order is tested without drawing anything.
 */
export interface RewardTimeline {
  missions: number;
  xp: number;
  bar: number;
  rankUp: number;
  badges: number;
}

const HEADER = 0.5;
const MISSION_STEP = 0.3;
const XP_TAG = 0.4;
const BAR = 0.9;
const RANK = 0.5;

export function rewardTimeline(input: { missions: number; hasProgress: boolean; rankUp: boolean }): RewardTimeline {
  let at = HEADER;
  const missions = at;
  if (input.missions > 0) at += input.missions * MISSION_STEP + 0.2;

  const xp = at;
  let bar = at;
  if (input.hasProgress) {
    at += XP_TAG;
    bar = at;
    at += BAR;
  }

  const rankUp = at;
  if (input.hasProgress && input.rankUp) at += RANK;

  return { missions, xp, bar, rankUp, badges: at + 0.1 };
}
