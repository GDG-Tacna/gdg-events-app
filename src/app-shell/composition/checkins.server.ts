import "server-only";
import { qrSigner } from "@/app-shell/composition/qr-signer.server";
import {
  FirestoreCheckInRepository,
  FirestoreCheckpointCatalog,
  FirstMatchQrPayloadVerifier,
  InMemoryAttemptLimiter,
  StaticQrPayloadVerifier,
  type RecordCheckInDeps,
} from "@/features/checkins/server";
import { EphemeralQrPayloadVerifier } from "@/features/ephemeral-qr/server";
import { ConsoleAnalytics } from "@/shared/lib/analytics/console-analytics";

/**
 * Composition root for check-ins (the cadet's own scans). Only a talk's ephemeral signed code checks in; a
 * printed station code is still recognized, so the use case can answer that staff scan it now. The limiter
 * lives for the life of the server instance.
 */
export const checkInDeps: RecordCheckInDeps = {
  checkIns: new FirestoreCheckInRepository(),
  catalog: new FirestoreCheckpointCatalog(),
  verifier: new FirstMatchQrPayloadVerifier([
    new StaticQrPayloadVerifier(),
    new EphemeralQrPayloadVerifier({ signer: qrSigner, now: Date.now }),
  ]),
  limiter: new InMemoryAttemptLimiter(),
  analytics: new ConsoleAnalytics(),
  now: () => new Date(),
};
