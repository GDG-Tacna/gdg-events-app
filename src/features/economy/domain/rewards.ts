import { logServerError } from "@/shared/lib/log";
import { ok, type Result } from "@/shared/lib/result";
import type { EconomySettings } from "./settings";
import { talkSource, type XpLedger } from "./xp";

export interface TalkRewardDeps {
  ledger: XpLedger;
  settings: () => Promise<EconomySettings>;
}

/**
 * G-Credits for attending a talk, after its check-in (new or repeated, so a reward that failed is paid on
 * the next scan). Once per talk and attendee. Returns the credits this call earned (0 when already paid,
 * switched off, or set to 0). A failure is logged and never fails the check-in.
 */
export async function rewardTalk(deps: TalkRewardDeps, uid: string, checkpointId: string): Promise<Result<{ credits: number }, never>> {
  const settings = await deps.settings();
  if (!settings.creditsEnabled || settings.talkCredits === 0) return ok({ credits: 0 });

  const granted = await deps.ledger.grant({ uid, source: talkSource(checkpointId), xp: 0, credits: settings.talkCredits });
  if (!granted.ok) {
    logServerError("economy.talk.reward", new Error(`${granted.error.code} for ${checkpointId}`));
    return ok({ credits: 0 });
  }
  return ok({ credits: granted.value.granted ? settings.talkCredits : 0 });
}
