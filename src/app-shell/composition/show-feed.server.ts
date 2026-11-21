import "server-only";
import { ephemeralQrDeps } from "@/app-shell/composition/ephemeral-qr.server";
import { agendaDeps } from "@/app-shell/composition/talks.server";
import { issueQr, type QrActor } from "@/features/ephemeral-qr/server";
import type { TalkQrDeps } from "@/features/show-feed/server";
import { getServerEnv } from "@/shared/config/env.server";
import { err, ok } from "@/shared/lib/result";

/**
 * Who issues the feed's codes. It exists only here, and the feed calls it only for a talk of the edition that is open
 * and in its time window (see `getTalkQr`), never for an entrance or a stand.
 */
const SHOW_FEED_ACTOR: QrActor = { uid: "show-feed", role: "admin" };

/**
 * Composition root for the show feed's talk codes: the talks from the agenda's one-minute copy (without a session it
 * is the public edition, the one cadets scan in), and the codes from the ephemeral QR feature, so they verify like any
 * other talk code.
 */
export const talkQrDeps: TalkQrDeps = {
  talks: async () => {
    const talks = await agendaDeps.talks();
    if (!talks.ok) return err({ code: talks.error.code });
    return ok(talks.value.map(({ id, title, startsAt, endsAt, active }) => ({ id, title, startsAt, endsAt, active })));
  },
  issue: async (talkId) => {
    const issued = await issueQr(ephemeralQrDeps, SHOW_FEED_ACTOR, { checkpointId: talkId });
    return issued.ok ? ok(issued.value) : err({ code: issued.error.code });
  },
};

/** The feed's bearer secret, read when used (a missing one switches the feed off). */
export const showFeedSecret = (): string | undefined => getServerEnv().showFeedToken;
