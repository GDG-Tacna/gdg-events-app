import type { Invite, InviteErrorCode } from "../domain/invites";
import type { ManagedRole } from "../domain/team";

/** A new invitation and its link path (the only time the link is known: only its hash is kept). */
export type CreateInviteActionResult = { ok: true; invite: Invite; path: string; emailed: boolean } | { ok: false; code: InviteErrorCode };
export type CreateInviteAction = (input: { email: string; role: ManagedRole }) => Promise<CreateInviteActionResult>;

export type RevokeInviteActionResult = { ok: true } | { ok: false; code: InviteErrorCode };
export type RevokeInviteAction = (input: { id: string }) => Promise<RevokeInviteActionResult>;

export type AcceptInviteActionResult = { ok: true; role: ManagedRole } | { ok: false; code: InviteErrorCode };
export type AcceptInviteAction = (input: { secret: string }) => Promise<AcceptInviteActionResult>;
