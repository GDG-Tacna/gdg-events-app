import type { Result } from "@/shared/lib/result";
import type { Account, EditionRole, ManagedRole, TeamMember } from "./team";
import type { TeamError } from "./team-error";

/** The identity provider side: finding an account and writing its role claim. */
export interface RoleDirectory {
  /** `null` when nobody has signed in with that email. */
  findByEmail(email: string): Promise<Result<Account | null, TeamError>>;
  /**
   * Sets the role claim; `null` clears it (the person registers as an attendee again on their next visit). It signs
   * the person out everywhere so the change applies at once, unless `keepSession` (they accepted an invitation and
   * renew their own session right after).
   */
  setRole(uid: string, role: ManagedRole | null, options?: { keepSession?: boolean }): Promise<Result<void, TeamError>>;
}

export interface TeamRepository {
  /** Global admins and the active edition's staff and organizers. */
  list(): Promise<Result<readonly TeamMember[], TeamError>>;
  /** The role a person holds now (admin, or their role in the active edition), or null. */
  roleOf(uid: string): Promise<Result<ManagedRole | null, TeamError>>;
  /** Their role in the active edition's team only (what makes a staff or organizer claim valid), or null. */
  /** Their role in one edition's team (named explicitly: the guard asks before the request's edition is known). */
  editionRoleOf(uid: string, eventId: string): Promise<Result<EditionRole | null, TeamError>>;
  /** Every edition where they have a role, for a staff or organizer outside the public edition. */
  editionRolesOf(uid: string): Promise<Result<ReadonlyArray<{ eventId: string; role: EditionRole }>, TeamError>>;
  /**
   * Stores the member's role, or removes them when `role` is null, in one transaction that refuses to
   * leave the team without an admin (`last-admin`). Returns the role the person had before, or null.
   */
  change(
    account: Account,
    role: ManagedRole | null,
  ): Promise<Result<{ previous: ManagedRole | null }, TeamError>>;
}

export interface AuditEntry {
  action:
    | "role.granted"
    | "role.revoked"
    | "checkpoint.created"
    | "checkpoint.renamed"
    | "checkpoint.activated"
    | "checkpoint.deactivated"
    | "checkpoint.requirements"
    | "talk.created"
    | "talk.updated"
    | "talk.activated"
    | "talk.deactivated"
    | "event.updated"
    | "event.created"
    | "event.finished"
    | "event.reopened"
    | "event.published"
    | "event.copied"
    | "event.modules"
    | "event.permissions"
    | "squads.seeded"
    | "squad.created"
    | "squad.updated"
    | "squad.retired"
    | "squad.reactivated"
    | "squad.reordered"
    | "missions.seeded"
    | "mission.created"
    | "mission.updated"
    | "mission.activated"
    | "mission.deactivated"
    | "mission.reordered"
    | "layout.seeded"
    | "quadrant.created"
    | "quadrant.updated"
    | "quadrant.activated"
    | "quadrant.deactivated"
    | "quadrant.reordered"
    | "venue.saved"
    | "ranks.updated"
    | "communications.seeded"
    | "communication.created"
    | "communication.updated"
    | "communication.activated"
    | "communication.deactivated"
    | "communication.reordered"
    | "story.titled"
    | "badges.seeded"
    | "badge.created"
    | "badge.updated"
    | "badge.activated"
    | "badge.deactivated"
    | "badge.reordered"
    | "minigames.updated"
    | "economy.updated"
    | "squad.bonus"
    | "squad.prize.created"
    | "squad.prize.updated"
    | "squad.prize.activated"
    | "squad.prize.deactivated"
    | "squad.redeemed"
    | "stage.updated"
    | "raffle.settings.updated"
    | "raffle.prize.created"
    | "raffle.prize.updated"
    | "raffle.drawn"
    | "raffle.voided"
    | "image.uploaded"
    | "invite.created"
    | "invite.revoked"
    | "invite.accepted";
  actorUid: string;
  targetUid: string;
  /** Small, non-secret facts about the change (for example the new role). */
  details: Record<string, string | null>;
  at: Date;
}

/** Append-only trail of what admins did. */
export interface AuditLog {
  append(entry: AuditEntry): Promise<Result<void, TeamError>>;
}
