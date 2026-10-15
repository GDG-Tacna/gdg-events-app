import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { checkInError, type CheckInError, type CheckInErrorCode } from "../domain/checkin-error";
import type { QrPayloadVerifier, VerifiedScan } from "../domain/ports";
import { FirstMatchQrPayloadVerifier } from "./first-match-qr-payload-verifier";

const accepting = (scan: VerifiedScan): QrPayloadVerifier => ({ verify: vi.fn(async () => ok(scan)) });
const rejecting = (code: CheckInErrorCode): QrPayloadVerifier => ({
  verify: vi.fn(async (): Promise<Result<VerifiedScan, CheckInError>> => err(checkInError(code))),
});

describe("FirstMatchQrPayloadVerifier", () => {
  it("answers with the first verifier that accepts the code and asks no further", async () => {
    const first = rejecting("invalid-code");
    const second = accepting({ checkpointId: "talk-1", source: "ephemeral" });
    const third = accepting({ checkpointId: "other", source: "static" });

    const result = await new FirstMatchQrPayloadVerifier([first, second, third]).verify("x");

    expect(result).toEqual(ok({ checkpointId: "talk-1", source: "ephemeral" }));
    expect(first.verify).toHaveBeenCalledWith("x");
    expect(third.verify).not.toHaveBeenCalled();
  });

  it("reports an invalid code when nobody recognizes it", async () => {
    const result = await new FirstMatchQrPayloadVerifier([rejecting("invalid-code"), rejecting("invalid-code")]).verify("x");

    expect(result).toEqual(err(checkInError("invalid-code")));
  });

  it("keeps the more useful answer: a genuine but late code is reported as expired, whatever the order", async () => {
    const expiredFirst = new FirstMatchQrPayloadVerifier([rejecting("expired-code"), rejecting("invalid-code")]);
    const expiredLast = new FirstMatchQrPayloadVerifier([rejecting("invalid-code"), rejecting("expired-code")]);

    expect(await expiredFirst.verify("x")).toEqual(err(checkInError("expired-code")));
    expect(await expiredLast.verify("x")).toEqual(err(checkInError("expired-code")));
  });

  it("does not let a failure of one adapter hide a verifier that accepts the code", async () => {
    const result = await new FirstMatchQrPayloadVerifier([
      rejecting("unknown"),
      accepting({ checkpointId: "lunch-1", source: "static" }),
    ]).verify("x");

    expect(result).toEqual(ok({ checkpointId: "lunch-1", source: "static" }));
  });

  it("rejects everything when there are no verifiers", async () => {
    expect(await new FirstMatchQrPayloadVerifier([]).verify("x")).toEqual(err(checkInError("invalid-code")));
  });
});
