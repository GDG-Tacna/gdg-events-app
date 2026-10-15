import { describe, expect, it, vi } from "vitest";
import type { Analytics } from "@/shared/lib/analytics/analytics";
import { err, ok, type Result } from "@/shared/lib/result";
import type {
  GateVerdict,
  AttendeeLookup,
  AttendeeSummary,
  CheckpointLookup,
  PassCheck,
  RationCounter,
  ServeCheckpoint,
  ServeGate,
  ServeLimiter,
  ServeRecorder,
} from "./ports";
import { getServePoint, listServePoints, serveAttendee, type ServeActor, type ServeDeps } from "./serve";
import { serveError } from "./serve-error";

const NOW = new Date("2026-10-20T13:00:00Z");
const STAFF: ServeActor = { uid: "staff-1", role: "staff" };
const LUNCH: ServeCheckpoint = { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true };
const ENTRANCE: ServeCheckpoint = { id: "entrance-main", kind: "entrance", name: "Entrada", active: true };
const STAND: ServeCheckpoint = { id: "stand-cloud", kind: "stand", name: "Stand Cloud", active: true };
const ANA: AttendeeSummary = { alias: "Nova_7", squadId: "gemini" };

interface Setup {
  allowed?: boolean;
  pass?: Result<{ uid: string }, { code: "invalid-code" | "expired-code" }>;
  found?: Result<ServeCheckpoint | null, { code: string }>;
  attendee?: Result<AttendeeSummary | null, { code: string }>;
  gate?: Result<GateVerdict, { code: string }>;
  recorded?: Result<{ kind: "recorded"; firstEntrance: boolean } | { kind: "already-recorded" }, { code: string }>;
  count?: Result<number, { code: string }>;
  active?: Result<readonly ServeCheckpoint[], { code: string }>;
}

function setup({
  allowed = true,
  pass = ok({ uid: "u1" }),
  found = ok(LUNCH),
  attendee = ok(ANA),
  gate = ok({ allowed: true }),
  recorded = ok({ kind: "recorded", firstEntrance: false }),
  count = ok(42),
  active = ok([LUNCH]),
}: Setup = {}) {
  const limiter: ServeLimiter = { consume: vi.fn(async () => allowed) };
  const passes: PassCheck = { verify: vi.fn(async () => pass) };
  const checkpoints: CheckpointLookup = { find: vi.fn(async () => found), listActive: vi.fn(async () => active) };
  const attendees: AttendeeLookup = { find: vi.fn(async () => attendee) };
  const recorder: ServeRecorder = { record: vi.fn(async () => recorded) };
  const counter: RationCounter = { count: vi.fn(async () => count) };
  const gateLookup: ServeGate = { check: vi.fn(async () => gate) };
  const analytics: Analytics = { track: vi.fn() };
  const deps: ServeDeps = { checkpoints, passes, attendees, recorder, counter, gate: gateLookup, limiter, analytics, now: () => NOW };
  return { deps, limiter, passes, checkpoints, attendees, recorder, counter, gate: gateLookup, analytics };
}

const serve = (t: ReturnType<typeof setup>, actor: ServeActor = STAFF) =>
  serveAttendee(t.deps, actor, { checkpointId: "lunch-1", payload: "devfest:at:pass" });

describe("serveAttendee", () => {
  it("hands over a ration: records it for the attendee in the pass, counts it and answers with who and how many", async () => {
    const t = setup();

    const result = await serve(t);

    expect(result).toEqual(ok({ uid: "u1", kind: "catering", status: "served", firstEntrance: false, alias: "Nova_7", squadId: "gemini", servedCount: 42 }));
    expect(t.passes.verify).toHaveBeenCalledWith("devfest:at:pass");
    expect(t.recorder.record).toHaveBeenCalledWith({ uid: "u1", checkpoint: LUNCH, at: NOW });
    expect(t.analytics.track).toHaveBeenCalledWith({
      name: "checkin_completed",
      uid: "u1",
      checkpointId: "lunch-1",
      kind: "catering",
      source: "staff",
    });
  });

  it("never records a scan at a kind of station the staff member may not operate", async () => {
    const t = setup();

    expect(await serveAttendee(t.deps, { ...STAFF, kinds: ["entrance", "stand"] }, { checkpointId: "lunch-1", payload: "devfest:at:pass" })).toEqual(err(serveError("forbidden")));
    expect(t.recorder.record).not.toHaveBeenCalled();
  });

  it("stops a second ration: the same attendee answers already-served, with nothing counted twice", async () => {
    const t = setup({ recorded: ok({ kind: "already-recorded" }) });

    const result = await serve(t);

    expect(result).toEqual(ok({ uid: "u1", kind: "catering", status: "already-served", firstEntrance: false, alias: "Nova_7", squadId: "gemini", servedCount: 42 }));
    expect(t.analytics.track).not.toHaveBeenCalled();
  });

  it.each([
    [{ uid: "u1", role: "attendee" }],
    [{ uid: "u1", role: null }],
  ] as const)("only staff or admin may serve: %j is refused before anything is read", async (actor) => {
    const t = setup();

    expect(await serve(t, actor)).toEqual(err(serveError("forbidden")));
    expect(t.limiter.consume).not.toHaveBeenCalled();
    expect(t.passes.verify).not.toHaveBeenCalled();
    expect(t.recorder.record).not.toHaveBeenCalled();
  });

  it("lets an admin serve too", async () => {
    expect(await serve(setup(), { uid: "a1", role: "admin" })).toMatchObject({ ok: true });
  });

  it("limits how fast one staff member can scan, before reading the pass", async () => {
    const t = setup({ allowed: false });

    expect(await serve(t)).toEqual(err(serveError("rate-limited")));
    expect(t.limiter.consume).toHaveBeenCalledWith("staff-1");
    expect(t.passes.verify).not.toHaveBeenCalled();
  });

  it.each(["invalid-code", "expired-code"] as const)("refuses a %s pass without touching the checkpoint or the person", async (code) => {
    const t = setup({ pass: err({ code }) });

    expect(await serve(t)).toEqual(err(serveError(code)));
    expect(t.checkpoints.find).not.toHaveBeenCalled();
    expect(t.attendees.find).not.toHaveBeenCalled();
    expect(t.recorder.record).not.toHaveBeenCalled();
  });

  it("says so when the checkpoint does not exist, is closed or is a talk (cadets scan those)", async () => {
    expect(await serve(setup({ found: ok(null) }))).toEqual(err(serveError("checkpoint-not-found")));
    expect(await serve(setup({ found: ok({ ...LUNCH, active: false }) }))).toEqual(err(serveError("checkpoint-inactive")));
    expect(await serve(setup({ found: ok({ ...LUNCH, kind: "talk" }) }))).toEqual(err(serveError("not-station")));
    expect(await serve(setup({ found: err({ code: "unknown" }) }))).toEqual(err(serveError("unknown")));
  });

  it("refuses a genuine pass of someone with no profile in this edition", async () => {
    const t = setup({ attendee: ok(null) });

    expect(await serve(t)).toEqual(err(serveError("attendee-not-found")));
    expect(t.recorder.record).not.toHaveBeenCalled();
  });

  it("refuses an attendee who does not meet the conditions, and records nothing", async () => {
    const missing = { level: 2, talks: null };
    const t = setup({ gate: ok({ allowed: false, missing }) });

    expect(await serve(t)).toEqual(err({ code: "not-eligible", missing }));
    expect(t.gate.check).toHaveBeenCalledWith({ uid: "u1", checkpoint: LUNCH });
    expect(t.recorder.record).not.toHaveBeenCalled();
  });

  it("answers unknown when the conditions cannot be checked, so the staff scans again, and records nothing", async () => {
    const t = setup({ gate: err({ code: "unknown" }) });

    expect(await serve(t)).toEqual(err(serveError("unknown")));
    expect(t.recorder.record).not.toHaveBeenCalled();
  });

  it("maps a missing profile found while recording, and any other failure, to the right error", async () => {
    expect(await serve(setup({ recorded: err({ code: "not-registered" }) }))).toEqual(err(serveError("attendee-not-found")));
    expect(await serve(setup({ recorded: err({ code: "unknown" }) }))).toEqual(err(serveError("unknown")));
    expect(await serve(setup({ attendee: err({ code: "unknown" }) }))).toEqual(err(serveError("unknown")));
  });

  it("registers a cadet at the entrance, telling when it is their first one, without asking any food gate", async () => {
    const t = setup({ found: ok(ENTRANCE), recorded: ok({ kind: "recorded", firstEntrance: true }), gate: ok({ allowed: false, missing: { level: 3, talks: null } }) });

    expect(await serve(t)).toEqual(ok({ uid: "u1", kind: "entrance", status: "served", firstEntrance: true, alias: "Nova_7", squadId: "gemini", servedCount: 42 }));
    expect(t.gate.check).not.toHaveBeenCalled();
    expect(t.recorder.record).toHaveBeenCalledWith({ uid: "u1", checkpoint: ENTRANCE, at: NOW });
    expect(t.analytics.track).toHaveBeenCalledWith(expect.objectContaining({ kind: "entrance", source: "staff" }));
  });

  it("records a stand visit once, without asking any food gate", async () => {
    const t = setup({ found: ok(STAND), gate: err({ code: "unknown" }) });

    expect(await serve(t)).toMatchObject({ ok: true, value: { kind: "stand", status: "served", firstEntrance: false } });
    expect(t.gate.check).not.toHaveBeenCalled();
    expect(await serve(setup({ found: ok(STAND), recorded: ok({ kind: "already-recorded" }) }))).toMatchObject({ ok: true, value: { kind: "stand", status: "already-served" } });
  });

  it("still serves when the counter cannot be read: the ration is recorded and the screen just lacks the number", async () => {
    const t = setup({ count: err({ code: "unknown" }) });

    expect(await serve(t)).toEqual(ok({ uid: "u1", kind: "catering", status: "served", firstEntrance: false, alias: "Nova_7", squadId: "gemini", servedCount: null }));
    expect(t.analytics.track).toHaveBeenCalledTimes(1);
  });
});

describe("listServePoints", () => {
  it("offers every open station (entrance, catering, stand, in that order, then by name) with its count, never a talk", async () => {
    const t = setup({
      active: ok([
        STAND,
        LUNCH,
        { id: "coffee-1", kind: "catering", name: "Coffee break", active: true },
        { id: "talk-1", kind: "talk", name: "Keynote", active: true },
        ENTRANCE,
      ]),
    });
    t.counter.count = vi.fn(async (id: string) => ok(id === "lunch-1" ? 10 : 3));

    const result = await listServePoints(t.deps, STAFF);

    expect(result).toEqual(
      ok([
        { id: "entrance-main", kind: "entrance", name: "Entrada", servedCount: 3 },
        { id: "lunch-1", kind: "catering", name: "Almuerzo", servedCount: 10 },
        { id: "coffee-1", kind: "catering", name: "Coffee break", servedCount: 3 },
        { id: "stand-cloud", kind: "stand", name: "Stand Cloud", servedCount: 3 },
      ]),
    );
    expect(t.counter.count).not.toHaveBeenCalledWith("talk-1");
  });

  it("offers staff only the kinds of station the edition lets them operate (admins every kind)", async () => {
    const t = setup({ active: ok([STAND, LUNCH, ENTRANCE]) });

    const staff = await listServePoints(t.deps, { ...STAFF, kinds: ["stand"] });
    expect(staff.ok && staff.value.map((point) => point.id)).toEqual(["stand-cloud"]);
    const admin = await listServePoints(t.deps, { uid: "a1", role: "admin", kinds: ["stand"] });
    expect(admin.ok && admin.value).toHaveLength(3);
  });

  it("keeps a point on the list when only its count fails", async () => {
    const t = setup({ count: err({ code: "unknown" }) });

    expect(await listServePoints(t.deps, STAFF)).toEqual(ok([{ id: "lunch-1", kind: "catering", name: "Almuerzo", servedCount: null }]));
  });

  it("is for staff and admin only, and reports a failed read as unknown", async () => {
    expect(await listServePoints(setup().deps, { uid: "u1", role: "attendee" })).toEqual(err(serveError("forbidden")));
    expect(await listServePoints(setup({ active: err({ code: "unknown" }) }).deps, STAFF)).toEqual(err(serveError("unknown")));
  });
});

describe("getServePoint", () => {
  it("returns the name and the rations handed out so far", async () => {
    expect(await getServePoint(setup().deps, STAFF, "lunch-1")).toEqual(ok({ id: "lunch-1", kind: "catering", name: "Almuerzo", servedCount: 42 }));
  });

  it("returns an entrance or a stand with its kind", async () => {
    expect(await getServePoint(setup({ found: ok(ENTRANCE) }).deps, STAFF, "entrance-main")).toMatchObject({ ok: true, value: { kind: "entrance" } });
    expect(await getServePoint(setup({ found: ok(STAND) }).deps, STAFF, "stand-cloud")).toMatchObject({ ok: true, value: { kind: "stand" } });
  });

  it("refuses staff a station of a kind the edition does not let them operate", async () => {
    expect(await getServePoint(setup().deps, { ...STAFF, kinds: ["entrance"] }, "lunch-1")).toEqual(err(serveError("forbidden")));
  });

  it("refuses a checkpoint that cannot serve, and anyone who may not", async () => {
    expect(await getServePoint(setup({ found: ok({ ...LUNCH, kind: "talk" }) }).deps, STAFF, "talk-1")).toEqual(
      err(serveError("not-station")),
    );
    expect(await getServePoint(setup().deps, { uid: "u1", role: "attendee" }, "lunch-1")).toEqual(err(serveError("forbidden")));
  });
});
