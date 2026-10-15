import type { CopyErrorCode, CopyPart } from "../domain/copy";
import type { EditionModule, ModulesErrorCode } from "../domain/modules";
import type { AccessLevel, AdminSection, PermissionsErrorCode, StaffStation } from "../domain/permissions";
import type { EditionDraft, EditionStatus, EditionsErrorCode } from "../domain/editions";

export type EditionActionResult = { ok: true } | { ok: false; code: EditionsErrorCode };
export type SaveEditionAction = (input: { id: string; draft: EditionDraft }) => Promise<EditionActionResult>;
export type SetEditionStatusAction = (input: { id: string; status: EditionStatus }) => Promise<EditionActionResult>;
export type PublishEditionAction = (input: { id: string }) => Promise<EditionActionResult>;

export type ChooseEditionResult = { ok: true } | { ok: false; code: "disabled" | "unauthenticated" | "forbidden" | "not-found" | "unavailable" | "unknown" };
export type ChooseEditionAction = (input: { id: string }) => Promise<ChooseEditionResult>;

export type CopyEditionResult = { ok: true; parts: readonly CopyPart[]; documents: number } | { ok: false; code: CopyErrorCode; parts?: readonly CopyPart[] };
export type CopyEditionAction = (input: { from: string; to: string; parts: readonly CopyPart[] }) => Promise<CopyEditionResult>;

export type SaveModulesResult = { ok: true } | { ok: false; code: ModulesErrorCode };
export type SaveModulesAction = (input: { eventId: string; off: readonly EditionModule[] }) => Promise<SaveModulesResult>;

export type SavePermissionsResult = { ok: true } | { ok: false; code: PermissionsErrorCode };
export type SavePermissionsAction = (input: { eventId: string; organizer: Partial<Record<AdminSection, AccessLevel>>; staffStations: readonly StaffStation[] }) => Promise<SavePermissionsResult>;
