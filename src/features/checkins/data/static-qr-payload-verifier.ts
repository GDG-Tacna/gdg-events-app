import { err, ok, type Result } from "@/shared/lib/result";
import { checkInError, type CheckInError } from "../domain/checkin-error";
import { isCheckpointId, type CheckpointId } from "../domain/checkpoint";
import type { QrPayloadVerifier, VerifiedScan } from "../domain/ports";

const PREFIX = "devfest:cp:";

/** The text printed in a static checkpoint QR. */
export const staticPayloadFor = (checkpointId: CheckpointId): string => `${PREFIX}${checkpointId}`;

/**
 * Verifier for printed codes (entrance, catering): the payload is just `devfest:cp:<id>`. A printed
 * code can be photographed, so it must never be the only proof for something worth stealing; the
 * ephemeral signed codes cover the talks.
 */
export class StaticQrPayloadVerifier implements QrPayloadVerifier {
  async verify(payload: string): Promise<Result<VerifiedScan, CheckInError>> {
    if (!payload.startsWith(PREFIX)) return err(checkInError("invalid-code"));
    const id = payload.slice(PREFIX.length);
    return isCheckpointId(id) ? ok({ checkpointId: id, source: "static" }) : err(checkInError("invalid-code"));
  }
}
