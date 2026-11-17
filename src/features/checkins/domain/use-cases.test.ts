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
const STAND: Checkpoint = { id: "stand-louis", kind: "stand", name: "Stand Louis 3D", active: true };

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
  it("returns the name, description and image of the scanned puesto for the cadet", async () => {
    const t = setup({ verified: ok({ checkpointId: STAND.id, source: "ephemeral" } as VerifiedScan), found: ok({ ...STAND, description: "Impresión 3D", image: "/media/logo.webp" }) });

    expect(await recordCheckIn(t.deps, { uid: "u1", payload: "x" })).toMatchObject({ ok: true, value: { checkpoint: { name: "Stand Louis 3D", description: "Impresión 3D", image: "/media/logo.webp" } } });
  });

  it("stores the check-in for a valid code and counts it once for the key metric", async () => {
    const t = setup();

    const result = await recordCheckIn(t.deps, { uid: "u1", payload: "devfest:cp:talk-keynote" });

    expect(result).toEqual(ok({ checkpointId: "talk-keynote", kind: "talk", recorded: true, firstEntrance: false, checkpoint: { name: "Keynote", description: "", image: null } }));
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

  it.each([TALK, LUNCH, ENTRANCE, STAND])("answers that staff scan a printed code ($kind), without reading or storing anything", async (checkpoint) => {
    const t = setup({ verified: ok({ checkpointId: checkpoint.id, source: "static" } as VerifiedScan), found: ok(checkpoint) });

    const result = await recordCheckIn(t.deps, { uid: "u1", payload: `devfest:cp:${checkpoint.id}` });

    expect(result).toEqual(err(checkInError("staff-station")));
    expect(t.catalog.find).not.toHaveBeenCalled();
    expect(t.checkIns.record).not.toHaveBeenCalled();
    expect(t.analytics.track).not.toHaveBeenCalled();
  });

  it("refuses a screen code for the catering: only staff scanning the pass serve a meal", async () => {
    const t = setup({ verified: ok({ checkpointId: LUNCH.id, source: "ephemeral" } as VerifiedScan), found: ok(LUNCH) });

    expect(await recordCheckIn(t.deps, { uid: "u1", payload: "x" })).toEqual(err(checkInError("invalid-code")));
    expect(t.checkIns.record).not.toHaveBeenCalled();
  });

  it("accepts a stand's screen code: the visit is recorded and counted like a staff scan of the pass", async () => {
    const t = setup({ verified: ok({ checkpointId: STAND.id, source: "ephemeral" } as VerifiedScan), found: ok(STAND) });

    expect(await recordCheckIn(t.deps, { uid: "u1", payload: "x" })).toEqual(ok({ checkpointId: "stand-louis", kind: "stand", recorded: true, firstEntrance: false, checkpoint: { name: "Stand Louis 3D", description: "", image: null } }));
    expect(t.checkIns.record).toHaveBeenCalledWith({ uid: "u1", checkpoint: STAND, at: NOW });
    expect(t.analytics.track).toHaveBeenCalledWith({ name: "checkin_completed", uid: "u1", checkpointId: "stand-louis", kind: "stand" });
  });

  it("accepts the entrance's screen code, and the first one registers the cadet at the event", async () => {
    const t = setup({ verified: ok({ checkpointId: ENTRANCE.id, source: "ephemeral" } as VerifiedScan), found: ok(ENTRANCE), outcome: ok({ kind: "recorded", firstEntrance: true }) });

    expect(await recordCheckIn(t.deps, { uid: "u1", payload: "x" })).toEqual(ok({ checkpointId: "entrance-main", kind: "entrance", recorded: true, firstEntrance: true, checkpoint: { name: "Entrada", description: "", image: null } }));
    expect(t.checkIns.record).toHaveBeenCalledWith({ uid: "u1", checkpoint: ENTRANCE, at: expect.any(Date) });
    expect(t.analytics.track).toHaveBeenCalledWith({ name: "checkin_completed", uid: "u1", checkpointId: "entrance-main", kind: "entrance" });
  });

  it("answers that a closed entrance is not taking check-ins", async () => {
    const t = setup({ verified: ok({ checkpointId: ENTRANCE.id, source: "ephemeral" } as VerifiedScan), found: ok({ ...ENTRANCE, active: false }) });

    expect(await recordCheckIn(t.deps, { uid: "u1", payload: "x" })).toEqual(err(checkInError("checkpoint-inactive")));
    expect(t.checkIns.record).not.toHaveBeenCalled();
  });

  it("passes the repository's first-entrance flag through", async () => {
    const t = setup({ outcome: ok({ kind: "recorded", firstEntrance: true }) });

    expect(await recordCheckIn(t.deps, { uid: "u1", payload: "x" })).toEqual(ok({ checkpointId: "talk-keynote", kind: "talk", recorded: true, firstEntrance: true, checkpoint: { name: "Keynote", description: "", image: null } }));
  });

  it("is idempotent: a repeated scan returns the existing check-in and is not counted again", async () => {
    const t = setup({ outcome: ok({ kind: "already-recorded" }) });

    const result = await recordCheckIn(t.deps, { uid: "u1", payload: "x" });

    expect(result).toEqual(ok({ checkpointId: "talk-keynote", kind: "talk", recorded: false, firstEntrance: false, checkpoint: { name: "Keynote", description: "", image: null } }));
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
