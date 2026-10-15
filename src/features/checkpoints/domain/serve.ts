import type { Analytics } from "@/shared/lib/analytics/analytics";
import { err, ok, type Result } from "@/shared/lib/result";
import type {
  AttendeeLookup,
  CheckpointLookup,
  PassCheck,
  RationCounter,
  ServeCheckpoint,
  ServeGate,
  ServeLimiter,
  ServeRecorder,
} from "./ports";
import { serveError, type ServeError } from "./serve-error";

export interface ServeDeps {
  checkpoints: CheckpointLookup;
  passes: PassCheck;
  attendees: AttendeeLookup;
  recorder: ServeRecorder;
  counter: RationCounter;
  gate: ServeGate;
  limiter: ServeLimiter;
  analytics: Analytics;
  now: () => Date;
}

/** Who is asking. The server action takes it from the verified session, never from the request. */
export interface ServeActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
  /** For staff: the kinds of station the edition lets them operate (all when absent). Admins operate every kind. */
  kinds?: readonly string[];
}

/**
 * The checkpoints staff operate by scanning the cadet's personal pass, in the order the staff home lists them.
 * Talks are not here: a cadet proves a talk by scanning the code on its screen.
 */
export const STATION_KINDS = ["entrance", "catering", "stand"] as const;
export type StationKind = (typeof STATION_KINDS)[number];

export const isStationKind = (kind: string): kind is StationKind => (STATION_KINDS as readonly string[]).includes(kind);

export type StationCheckpoint = ServeCheckpoint & { kind: StationKind };

export interface ServeResult {
  /** The scanned cadet. The server uses it for the follow-up rewards; it never goes back to the staff screen. */
  uid: string;
  kind: StationKind;
  /** `already-served` is the double ration (or the repeated visit) the whole flow exists to stop. */
  status: "served" | "already-served";
  /** True when this scan registered the cadet at the event (their first entrance). */
  firstEntrance: boolean;
  alias: string;
  squadId: string | null;
  /** Scans recorded at this checkpoint, or `null` when the count could not be read (the scan still counts). */
  servedCount: number | null;
}

const canServe = (actor: ServeActor) => actor.role === "staff" || actor.role === "admin";
const mayOperate = (actor: ServeActor, kind: StationKind) => actor.role === "admin" || actor.kinds === undefined || actor.kinds.includes(kind);

/** The checkpoint must exist, be open and be one staff operate (entrance, catering or stand). */
async function loadServePoint(
  deps: Pick<ServeDeps, "checkpoints">,
  checkpointId: string,
): Promise<Result<StationCheckpoint, ServeError>> {
  const found = await deps.checkpoints.find(checkpointId);
  if (!found.ok) return err(serveError("unknown"));
  if (found.value === null) return err(serveError("checkpoint-not-found"));
  if (!found.value.active) return err(serveError("checkpoint-inactive"));
  const { kind } = found.value;
  if (!isStationKind(kind)) return err(serveError("not-station"));
  return ok({ ...found.value, kind });
}

/**
 * Staff scanned a cadet's pass at a station (entrance, catering or stand). In order: the staff member may
 * scan and is not going too fast, the pass is genuine and alive, the checkpoint is an open station, the person
 * has a profile and, for a meal, meets its conditions; only then the check-in is recorded. Idempotent:
 * scanning the same cadet again answers `already-served` and writes nothing, so nobody gets two rations or two
 * stand visits.
 */
export async function serveAttendee(
  deps: ServeDeps,
  actor: ServeActor,
  input: { checkpointId: string; payload: string },
): Promise<Result<ServeResult, ServeError>> {
  if (!canServe(actor)) return err(serveError("forbidden"));
  if (!(await deps.limiter.consume(actor.uid))) return err(serveError("rate-limited"));

  const pass = await deps.passes.verify(input.payload);
  if (!pass.ok) return err(serveError(pass.error.code));

  const checkpoint = await loadServePoint(deps, input.checkpointId);
  if (!checkpoint.ok) return checkpoint;
  if (!mayOperate(actor, checkpoint.value.kind)) return err(serveError("forbidden"));

  const attendee = await deps.attendees.find(pass.value.uid);
  if (!attendee.ok) return err(serveError("unknown"));
  if (attendee.value === null) return err(serveError("attendee-not-found"));

  // Only a meal has conditions (its food gate); the entrance and the stands let every registered cadet in.
  if (checkpoint.value.kind === "catering") {
    const verdict = await deps.gate.check({ uid: pass.value.uid, checkpoint: checkpoint.value });
    if (!verdict.ok) return err(serveError("unknown"));
    if (!verdict.value.allowed) return err(serveError("not-eligible", verdict.value.missing));
  }

  const outcome = await deps.recorder.record({ uid: pass.value.uid, checkpoint: checkpoint.value, at: deps.now() });
  if (!outcome.ok) return err(serveError(outcome.error.code === "not-registered" ? "attendee-not-found" : "unknown"));

  const served = outcome.value.kind === "recorded";
  if (served) {
    deps.analytics.track({
      name: "checkin_completed",
      uid: pass.value.uid,
      checkpointId: checkpoint.value.id,
      kind: checkpoint.value.kind,
      source: "staff",
    });
  }

  // The count is for the staff's screen: failing to read it never undoes or hides a scan that was recorded.
  const counted = await deps.counter.count(checkpoint.value.id);
  return ok({
    uid: pass.value.uid,
    kind: checkpoint.value.kind,
    status: served ? "served" : "already-served",
    firstEntrance: outcome.value.kind === "recorded" && outcome.value.firstEntrance,
    alias: attendee.value.alias,
    squadId: attendee.value.squadId,
    servedCount: counted.ok ? counted.value : null,
  });
}

export interface ServePoint {
  id: string;
  kind: StationKind;
  name: string;
  servedCount: number | null;
}

/**
 * The stations staff can operate: open entrance, catering and stand checkpoints of the kinds the edition lets them
 * operate, grouped by kind in that order (then by name), each with how many cadets it has scanned.
 */
export async function listServePoints(
  deps: Pick<ServeDeps, "checkpoints" | "counter">,
  actor: ServeActor,
): Promise<Result<readonly ServePoint[], ServeError>> {
  if (!canServe(actor)) return err(serveError("forbidden"));

  const active = await deps.checkpoints.listActive();
  if (!active.ok) return err(serveError("unknown"));

  const stations = active.value
    .flatMap((checkpoint) => (isStationKind(checkpoint.kind) && mayOperate(actor, checkpoint.kind) ? [{ ...checkpoint, kind: checkpoint.kind }] : []))
    .sort((a, b) => STATION_KINDS.indexOf(a.kind) - STATION_KINDS.indexOf(b.kind) || a.name.localeCompare(b.name, "es"));
  const points = await Promise.all(
    stations.map(async (checkpoint) => {
      const counted = await deps.counter.count(checkpoint.id);
      return { id: checkpoint.id, kind: checkpoint.kind, name: checkpoint.name, servedCount: counted.ok ? counted.value : null };
    }),
  );
  return ok(points);
}

/** One station for the scanning screen: its kind, its name and how many cadets it has scanned so far. */
export async function getServePoint(
  deps: Pick<ServeDeps, "checkpoints" | "counter">,
  actor: ServeActor,
  checkpointId: string,
): Promise<Result<ServePoint, ServeError>> {
  if (!canServe(actor)) return err(serveError("forbidden"));

  const checkpoint = await loadServePoint(deps, checkpointId);
  if (!checkpoint.ok) return checkpoint;
  if (!mayOperate(actor, checkpoint.value.kind)) return err(serveError("forbidden"));

  const counted = await deps.counter.count(checkpoint.value.id);
  return ok({ id: checkpoint.value.id, kind: checkpoint.value.kind, name: checkpoint.value.name, servedCount: counted.ok ? counted.value : null });
}
