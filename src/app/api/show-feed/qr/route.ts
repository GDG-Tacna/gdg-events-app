import { talkQrDeps } from "@/app-shell/composition/show-feed.server";
import { getTalkQr, type TalkQrErrorCode } from "@/features/show-feed/server";
import { logServerError } from "@/shared/lib/log";
import { feedDenied, feedError, feedJson, feedPreflight } from "../http";

const STATUS: Record<TalkQrErrorCode, number> = {
  "bad-request": 400,
  "not-found": 404,
  inactive: 409,
  unknown: 500,
};

/**
 * A fresh attendance code for a talk (`?talk=<id>`), as rows of cells the show draws itself. Any open talk gets one,
 * at any time: the operator decides when to project it. The signed text never leaves.
 */
export async function GET(request: Request) {
  const denied = feedDenied(request);
  if (denied) return denied;
  try {
    const qr = await getTalkQr(talkQrDeps, new URL(request.url).searchParams.get("talk"));
    if (!qr.ok) {
      if (qr.error.code === "unknown") logServerError("show-feed.qr", new Error("the talk code could not be issued"));
      return feedError(qr.error.code, STATUS[qr.error.code]);
    }
    return feedJson({ ...qr.value });
  } catch (cause) {
    logServerError("show-feed.qr", cause);
    return feedError("unknown", 500);
  }
}

export const OPTIONS = feedPreflight;
