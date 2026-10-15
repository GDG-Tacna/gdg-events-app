"use client";

import { connectContactAction, issueContactCodeAction, saveContactLinksAction } from "@/app-shell/network/network.actions";
import { NetworkView, type CadetCard, type ContactReward } from "@/features/network";
import { QrCodeCamera } from "@/features/scanner";

export interface NetworkScreenProps {
  me: CadetCard;
  contacts: ReadonlyArray<CadetCard & { id: string }>;
  reward: ContactReward;
  achievementsHref?: string;
}

/**
 * The Red bound to the real camera and the real server actions. It lives in the app shell because it is the one
 * place that knows both: the page (server) cannot create a camera, and the feature does not know the actions.
 */
export function NetworkScreen(props: NetworkScreenProps) {
  return <NetworkView {...props} issue={issueContactCodeAction} connect={connectContactAction} saveLinks={saveContactLinksAction} camera={QrCodeCamera} />;
}
