import { z } from "zod";
import { isRole, type Role } from "@/features/auth/server";
import { err, ok, type Result } from "@/shared/lib/result";
import { isSquadId, type SquadId } from "@/shared/types/squad";
import type { Alias } from "../../domain/alias";
import type { Attendee } from "../../domain/attendee";

export const USER_SCHEMA_VERSION = 1;

/** Anything with `toDate()` (a Firestore Timestamp), kept structural so the mapper has no SDK import. */
const timestampSchema = z.custom<{ toDate(): Date }>(
  (value) => typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function",
);

const userDocSchema = z.object({
  alias: z.string().min(1),
  role: z.custom<Role>(isRole),
  squad: z.custom<SquadId | null>((value) => value === null || isSquadId(value)),
  xp: z.number().int().nonnegative(),
  credits: z.number().int().nonnegative(),
  createdAt: timestampSchema,
});

export type DocumentError = "invalid-document";

/** Firestore document → domain entity. Rejects documents that do not match the schema instead of guessing. */
export function mapUserDoc(uid: string, data: unknown): Result<Attendee, DocumentError> {
  const parsed = userDocSchema.safeParse(data);
  if (!parsed.success) return err("invalid-document");

  const doc = parsed.data;
  return ok({
    uid,
    alias: doc.alias,
    role: doc.role,
    squad: doc.squad,
    xp: doc.xp,
    credits: doc.credits,
    createdAt: doc.createdAt.toDate(),
  });
}

/** Domain entity → the `events/{eventId}/participants/{uid}` document. JS dates are stored as Firestore timestamps by the SDK. */
export function toUserDoc(attendee: Attendee, alias: Alias) {
  return {
    alias: attendee.alias,
    aliasLower: alias.key,
    role: attendee.role,
    squad: attendee.squad,
    xp: attendee.xp,
    credits: attendee.credits,
    createdAt: attendee.createdAt,
    schemaVersion: USER_SCHEMA_VERSION,
  };
}

/** The `events/{eventId}/aliases/{aliasLower}` reservation document. */
export function toAliasDoc(attendee: Attendee) {
  return { uid: attendee.uid, createdAt: attendee.createdAt };
}
