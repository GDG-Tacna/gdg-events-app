import "server-only";
import { attendeeDeps } from "@/app-shell/composition/attendee.server";
import { checkInDeps } from "@/app-shell/composition/checkins.server";
import { foodGate } from "@/app-shell/composition/food-gate.server";
import { qrSigner } from "@/app-shell/composition/qr-signer.server";
import { type AttendeeLookup, type ServeDeps } from "@/features/checkpoints/server";
import { FirestoreCheckInCounter, InMemoryAttemptLimiter } from "@/features/checkins/server";
import { PassVerifier } from "@/features/pass/server";
import { ConsoleAnalytics } from "@/shared/lib/analytics/console-analytics";

/** What the staff screen shows about a person: their alias and squad, read through the attendee feature's repository. */
const attendees: AttendeeLookup = {
  async find(uid) {
    const found = await attendeeDeps.attendees.findByUid(uid);
    if (!found.ok) return { ok: false, error: { code: found.error.code } };
    return { ok: true, value: found.value === null ? null : { alias: found.value.alias, squadId: found.value.squad } };
  },
};

/**
 * Composition root for serving rations. The checkpoints and the check-in repository are the same ones
 * check-ins use, so a ration given by staff and one claimed by the attendee are the same record (one per
 * person and meal). Staff may scan faster than attendees, hence their own, higher limit.
 */
export const serveDeps: ServeDeps = {
  checkpoints: checkInDeps.catalog,
  passes: new PassVerifier({ signer: qrSigner, now: Date.now }),
  attendees,
  recorder: checkInDeps.checkIns,
  counter: new FirestoreCheckInCounter(),
  gate: foodGate,
  limiter: new InMemoryAttemptLimiter({ maxAttempts: 120 }),
  analytics: new ConsoleAnalytics(),
  now: () => new Date(),
};
