import type { Analytics } from "@/shared/lib/analytics/analytics";
import { err, ok, type Result } from "@/shared/lib/result";
import { checkInError, type CheckInError } from "./checkin-error";
import type { CheckpointId, CheckpointKind } from "./checkpoint";
import type { AttemptLimiter, CheckInRepository, CheckpointCatalog, QrPayloadVerifier } from "./ports";

export interface RecordCheckInDeps {
  checkIns: CheckInRepository;
  catalog: CheckpointCatalog;
  verifier: QrPayloadVerifier;
  limiter: AttemptLimiter;
  analytics: Analytics;
  now: () => Date;
}

export interface RecordCheckInResult {
  checkpointId: CheckpointId;
  kind: CheckpointKind;
  /** False when the attendee had already checked in here: nothing changed. */
  recorded: boolean;
  /** True when this scan registered the attendee at the event (their first entrance check-in). */
  firstEntrance: boolean;
}

/**
 * An attendee scanned a code. The order matters: the attempt is counted first so guessing is limited,
 * then the code is verified, the checkpoint must exist and be active, and only then is the check-in
 * stored. Idempotent: scanning the same checkpoint again returns the existing one, and only a real
 * check-in is counted for the key metric.
 *
 * A cadet checks in only to talks, with the code on the talk's screen (signed, short-lived). The stations
 * (entrance, catering, stands) are operated by staff, who scan the cadet's pass: a printed station code is
 * retired (it can be photographed and passed around) and answers `staff-station` without reading anything.
 */
export async function recordCheckIn(
  deps: RecordCheckInDeps,
  input: { uid: string; payload: string },
): Promise<Result<RecordCheckInResult, CheckInError>> {
  if (!(await deps.limiter.consume(input.uid))) return err(checkInError("rate-limited"));

  const verified = await deps.verifier.verify(input.payload);
  if (!verified.ok) return verified;
  if (verified.value.source === "static") return err(checkInError("staff-station"));

  const found = await deps.catalog.find(verified.value.checkpointId);
  if (!found.ok) return found;
  // A checkpoint that does not exist answers like a bad code, so nobody can probe which ids exist.
  if (found.value === null) return err(checkInError("invalid-code"));
  if (!found.value.active) return err(checkInError("checkpoint-inactive"));

  const checkpoint = found.value;
  // Signed screen codes exist only for talks; anything else answers like a bad code.
  if (checkpoint.kind !== "talk") return err(checkInError("invalid-code"));

  const outcome = await deps.checkIns.record({ uid: input.uid, checkpoint, at: deps.now() });
  if (!outcome.ok) return outcome;

  if (outcome.value.kind === "already-recorded") {
    return ok({ checkpointId: checkpoint.id, kind: checkpoint.kind, recorded: false, firstEntrance: false });
  }
  deps.analytics.track({
    name: "checkin_completed",
    uid: input.uid,
    checkpointId: checkpoint.id,
    kind: checkpoint.kind,
  });
  return ok({
    checkpointId: checkpoint.id,
    kind: checkpoint.kind,
    recorded: true,
    firstEntrance: outcome.value.firstEntrance,
  });
}
