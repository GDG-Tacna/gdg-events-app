/**
 * A transmission of the Odisea de Código: a short piece of the story of one quadrant. It opens when the
 * attendee completes a specific mission (`unlockMissionId`), or from the start when that is `null`.
 * Stable slug id; deactivated, never deleted.
 */
export interface Communication {
  id: string;
  quadrantId: string;
  title: string;
  body: string;
  unlockMissionId: string | null;
  order: number;
  active: boolean;
}

export const COMMUNICATION_TITLE_MIN = 3;
export const COMMUNICATION_TITLE_MAX = 60;
export const COMMUNICATION_BODY_MIN = 10;
export const COMMUNICATION_BODY_MAX = 1000;

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const isSlug = (value: unknown): value is string => typeof value === "string" && SLUG.test(value);

export type CommunicationDataErrorCode = "invalid-id" | "invalid-quadrant" | "invalid-title" | "invalid-body" | "invalid-mission";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, min: number, max: number) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
};

/** Checks a communication from stored or admin-submitted data (the id comes from the document) and says which field is wrong. */
export function checkCommunication(id: string, input: unknown): { ok: true; value: Communication } | { ok: false; code: CommunicationDataErrorCode } {
  if (!isSlug(id)) return { ok: false, code: "invalid-id" };
  if (!isRecord(input)) return { ok: false, code: "invalid-title" };
  if (!isSlug(input.quadrantId)) return { ok: false, code: "invalid-quadrant" };
  const title = text(input.title, COMMUNICATION_TITLE_MIN, COMMUNICATION_TITLE_MAX);
  if (!title) return { ok: false, code: "invalid-title" };
  const body = text(input.body, COMMUNICATION_BODY_MIN, COMMUNICATION_BODY_MAX);
  if (!body) return { ok: false, code: "invalid-body" };
  const unlock = input.unlockMissionId;
  if (unlock !== null && unlock !== undefined && !isSlug(unlock)) return { ok: false, code: "invalid-mission" };
  return {
    ok: true,
    value: {
      id,
      quadrantId: input.quadrantId,
      title,
      body,
      unlockMissionId: isSlug(unlock) ? unlock : null,
      order: typeof input.order === "number" && Number.isFinite(input.order) ? input.order : Number.MAX_SAFE_INTEGER,
      active: input.active === true,
    },
  };
}

export const parseCommunication = (id: string, input: unknown): Communication | null => {
  const checked = checkCommunication(id, input);
  return checked.ok ? checked.value : null;
};
