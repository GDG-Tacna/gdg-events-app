import { describe, expect, it, vi } from "vitest";
import type { Analytics } from "@/shared/lib/analytics/analytics";
import { err, ok, type Result } from "@/shared/lib/result";
import { checkInError, type CheckInError } from "./checkin-error";
import type { Checkpoint } from "./checkpoint";
import type {
  AttemptLimiter,
  CheckInRepository,
  CheckpointCatalog,
  QrPayloadVerifier,
  RecordOutcome,
  VerifiedScan,
} from "./ports";
import { recordCheckIn, type RecordCheckInDeps } from "./use-cases";

const NOW = new Date("2026-10-20T14:00:00Z");
const TALK: Checkpoint = { id: "talk-keynote", kind: "talk", name: "Keynote", active: true };
const LUNCH: Checkpoint = { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true };
const ENTRANCE: Checkpoint = { id: "entrance-main", kind: "entrance", name: "Entrada", active: true };

interface Setup {
  allowed?: boolean;
  verified?: Result<VerifiedScan, CheckInError>;
  found?: Result<Checkpoint | null, CheckInError>;
  outcome?: Result<RecordOutcome, CheckInError>;
}

function setup({
  allowed = true,
  verified = ok({ checkpointId: TALK.id, source: "ephemeral" } as VerifiedScan),
  found = ok(TALK),
  outcome = ok({ kind: "recorded", firstEntrance: false }),
}: Setup = {}) {
  const limiter: AttemptLimiter = { consume: vi.fn(async () => allowed) };
  const verifier: QrPayloadVerifier = { verify: vi.fn(async () => verified) };
  const catalog: CheckpointCatalog = { find: vi.fn(async () => found), listActive: vi.fn(async () => ok([])) };
  const checkIns: CheckInRepository = { record: vi.fn(async () => outcome) };
  const analytics: Analytics = { track: vi.fn() };
  const deps: RecordCheckInDeps = { checkIns, catalog, verifier, limiter, analytics, now: () => NOW };
  return { deps, limiter, verifier, catalog, checkIns, analytics };
}

describe("recordCheckIn", () => {
  it("stores the check-in for a valid code and counts it once for the key metric", async () => {
    const t = setup();

    const result = await recordCheckIn(t.deps, { uid: "u1", payload: "devfest:cp:talk-keynote" });

    expect(result).toEqual(ok({ checkpointId: "talk-keynote", kind: "talk", recorded: true, firstEntrance: false }));
    expect(t.verifier.verify).toHaveBeenCalledWith("devfest:cp:talk-keynote");
    expect(t.catalog.find).toHaveBeenCalledWith("talk-keynote");
    expect(t.checkIns.record).toHaveBeenCalledWith({ uid: "u1", checkpoint: TALK, at: NOW });
    expect(t.analytics.track).toHaveBeenCalledTimes(1);
    expect(t.analytics.track).toHaveBeenCalledWith({
      name: "checkin_completed",
      uid: "u1",
      checkpointId: "talk-keynote",
      kind: "talk",
    });
  });

  it.each([TALK, LUNCH, ENTRANCE])("answers that staff scan a printed code ($kind), without reading or storing anything", async (checkpoint) => {
    const t = setup({ verified: ok({ checkpointId: checkpoint.id, source: "static" } as VerifiedScan), found: ok(checkpoint) });

    const result = await recordCheckIn(t.deps, { uid: "u1", payload: `devfest:cp:${checkpoint.id}` });

    expect(result).toEqual(err(checkInError("staff-station")));
    expect(t.catalog.find).not.toHaveBeenCalled();
    expect(t.checkIns.record).not.toHaveBeenCalled();
    expect(t.analytics.track).not.toHaveBeenCalled();
  });

  it.each([LUNCH, ENTRANCE, { ...ENTRANCE, id: "stand-cloud", kind: "stand" as const }])("refuses a screen code for anything but a talk ($kind)", async (checkpoint) => {
    const t = setup({ verified: ok({ checkpointId: checkpoint.id, source: "ephemeral" } as VerifiedScan), found: ok(checkpoint) });

    expect(await recordCheckIn(t.deps, { uid: "u1", payload: "x" })).toEqual(err(checkInError("invalid-code")));
    expect(t.checkIns.record).not.toHaveBeenCalled();
  });

  it("passes the repository's first-entrance flag through", async () => {
    const t = setup({ outcome: ok({ kind: "recorded", firstEntrance: true }) });

    expect(await recordCheckIn(t.deps, { uid: "u1", payload: "x" })).toEqual(ok({ checkpointId: "talk-keynote", kind: "talk", recorded: true, firstEntrance: true }));
  });

  it("is idempotent: a repeated scan returns the existing check-in and is not counted again", async () => {
    const t = setup({ outcome: ok({ kind: "already-recorded" }) });

    const result = await recordCheckIn(t.deps, { uid: "u1", payload: "x" });

    expect(result).toEqual(ok({ checkpointId: "talk-keynote", kind: "talk", recorded: false, firstEntrance: false }));
    expect(t.analytics.track).not.toHaveBeenCalled();
  });

  it("stops an over-limit attendee before reading or verifying anything", async () => {
    const t = setup({ allowed: false });

    const result = await recordCheckIn(t.deps, { uid: "u1", payload: "x" });

    expect(result).toEqual(err(checkInError("rate-limited")));
    expect(t.limiter.consume).toHaveBeenCalledWith("u1");
    expect(t.verifier.verify).not.toHaveBeenCalled();
    expect(t.catalog.find).not.toHaveBeenCalled();
    expect(t.checkIns.record).not.toHaveBeenCalled();
  });

  it("counts the attempt even when the code is bad, so guessing is limited", async () => {
    const t = setup({ verified: err(checkInError("invalid-code")) });

    const result = await recordCheckIn(t.deps, { uid: "u1", payload: "garbage" });

    expect(result).toEqual(err(checkInError("invalid-code")));
    expect(t.limiter.consume).toHaveBeenCalledTimes(1);
    expect(t.catalog.find).not.toHaveBeenCalled();
    expect(t.checkIns.record).not.toHaveBeenCalled();
  });

  it("answers an unknown checkpoint like a bad code, so ids cannot be probed", async () => {
    const t = setup({ found: ok(null) });

    expect(await recordCheckIn(t.deps, { uid: "u1", payload: "x" })).toEqual(err(checkInError("invalid-code")));
    expect(t.checkIns.record).not.toHaveBeenCalled();
  });

  it("refuses an inactive checkpoint without storing anything", async () => {
    const t = setup({ found: ok({ ...TALK, active: false }) });

    expect(await recordCheckIn(t.deps, { uid: "u1", payload: "x" })).toEqual(err(checkInError("checkpoint-inactive")));
    expect(t.checkIns.record).not.toHaveBeenCalled();
    expect(t.analytics.track).not.toHaveBeenCalled();
  });

  it("passes catalog failures through", async () => {
    const t = setup({ found: err(checkInError("unknown")) });

    expect(await recordCheckIn(t.deps, { uid: "u1", payload: "x" })).toEqual(err(checkInError("unknown")));
  });

  it("passes repository failures through and counts nothing", async () => {
    const t = setup({ outcome: err(checkInError("not-registered")) });

    expect(await recordCheckIn(t.deps, { uid: "u1", payload: "x" })).toEqual(err(checkInError("not-registered")));
    expect(t.analytics.track).not.toHaveBeenCalled();
  });
});
