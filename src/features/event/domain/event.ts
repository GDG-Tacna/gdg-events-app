import { EDITION } from "@/shared/config/edition";
import { err, ok, type Result } from "@/shared/lib/result";

/** The edition the app serves, as other features need it. */
export interface EventInfo {
  id: string;
  /** When the event is over, or `null` while nobody has said. */
  endsAt: Date | null;
  /** An admin can mark it finished before (or without) an end date. */
  status?: "draft" | "finished";
}

export interface EventError {
  code: "unknown";
}

/** Over once an admin marks it finished or its end has passed. Without either the event is never considered over. */
export function isFinished(event: EventInfo, now: Date): boolean {
  return event.status === "finished" || (event.endsAt !== null && now.getTime() >= event.endsAt.getTime());
}

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * A date and time as an admin types it ("2026-10-24T18:00", the value of a `datetime-local` field), read
 * in the event's time zone. `null` when it is not a real date.
 */
export function fromEventLocal(value: string): Date | null {
  const match = LOCAL_PATTERN.exec(value);
  if (!match) return null;
  const date = new Date(`${value}:00${EDITION.utcOffset}`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject dates that roll over (February 30th becomes March 2nd in JavaScript).
  return toEventLocal(date) === value ? date : null;
}

/** The reverse of `fromEventLocal`: what a `datetime-local` field shows for this moment in the event's time zone. */
export function toEventLocal(date: Date): string {
  const sign = EDITION.utcOffset.startsWith("-") ? -1 : 1;
  const [hours, minutes] = EDITION.utcOffset.slice(1).split(":").map(Number);
  const shifted = new Date(date.getTime() + sign * (hours * 60 + minutes) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** The public edition, as far as other features ask about it. */
export interface EventStore {
  get(): Promise<Result<EventInfo, { code: string }>>;
}

export interface EventDeps {
  store: EventStore;
  now: () => Date;
}

/** Whether the active edition is over. For other features' rules (retiring a squad); no role is needed to ask. */
export async function hasEventFinished(deps: Pick<EventDeps, "store" | "now">): Promise<Result<boolean, EventError>> {
  const event = await deps.store.get();
  return event.ok ? ok(isFinished(event.value, deps.now())) : err({ code: "unknown" });
}
