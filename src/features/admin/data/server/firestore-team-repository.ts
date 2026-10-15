import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { EDITION_TEAM_COLLECTION, EVENTS_COLLECTION, TEAM_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isEventId } from "@/shared/types/event";
import type { TeamRepository } from "../../domain/ports";
import { isEditionRole, isManagedRole, type Account, type EditionRole, type ManagedRole, type TeamMember } from "../../domain/team";
import { teamError, type TeamError } from "../../domain/team-error";

type Doc = Record<string, unknown> | undefined;

function toMember(uid: string, data: Doc, roleCheck: (value: unknown) => value is ManagedRole): TeamMember | null {
  // A malformed record is skipped rather than guessed at.
  if (!data || !roleCheck(data.role) || typeof data.email !== "string") return null;
  return { uid, email: data.email, displayName: typeof data.displayName === "string" ? data.displayName : null, role: data.role };
}

const isAdminRole = (value: unknown): value is "admin" => value === "admin";

/**
 * Firestore adapter (Admin SDK) for the team. Admins are global (`team/{uid}`); staff and organizers belong to one
 * edition (`events/{eventId}/team/{uid}`), so a new edition starts without them. Older records of staff kept in the
 * global list are read as staff and cleared the next time that person's role changes. The role claim is what grants
 * access; these records let the server check the edition and the admin list and audit the team.
 */
export class FirestoreTeamRepository implements TeamRepository {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async refs(uid: string) {
    const db = this.getDb();
    const eventId = await this.getEventId();
    return { db, global: db.collection(TEAM_COLLECTION).doc(uid), edition: eventCollection(db, eventId, EDITION_TEAM_COLLECTION).doc(uid), eventId };
  }

  async list(): Promise<Result<readonly TeamMember[], TeamError>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const [admins, edition] = await Promise.all([db.collection(TEAM_COLLECTION).get(), eventCollection(db, eventId, EDITION_TEAM_COLLECTION).get()]);
      const members = new Map<string, TeamMember>();
      for (const doc of edition.docs) {
        const member = toMember(doc.id, doc.data(), isEditionRole);
        if (member) members.set(member.uid, member);
      }
      for (const doc of admins.docs) {
        // Admins always show; an older global staff record shows only when the edition has nothing for that person.
        const member = toMember(doc.id, doc.data(), isManagedRole);
        if (member && (member.role === "admin" || !members.has(member.uid))) members.set(member.uid, member);
      }
      return ok([...members.values()].sort((a, b) => a.email.localeCompare(b.email)));
    } catch (cause) {
      logServerError("admin.team.list", cause);
      return err(teamError("unknown"));
    }
  }

  async roleOf(uid: string): Promise<Result<ManagedRole | null, TeamError>> {
    try {
      const { global, edition } = await this.refs(uid);
      const [globalDoc, editionDoc] = await Promise.all([global.get(), edition.get()]);
      return ok(previousRole(globalDoc.data(), editionDoc.data()));
    } catch (cause) {
      logServerError("admin.team.roleOf", cause);
      return err(teamError("unknown"));
    }
  }

  async editionRoleOf(uid: string, eventId: string): Promise<Result<EditionRole | null, TeamError>> {
    try {
      const role: unknown = (await eventCollection(this.getDb(), eventId, EDITION_TEAM_COLLECTION).doc(uid).get()).data()?.role;
      return ok(isEditionRole(role) ? role : null);
    } catch (cause) {
      logServerError("admin.team.editionRoleOf", cause);
      return err(teamError("unknown"));
    }
  }

  async editionRolesOf(uid: string): Promise<Result<ReadonlyArray<{ eventId: string; role: EditionRole }>, TeamError>> {
    try {
      const db = this.getDb();
      // Editions are few: one listing and one batched read of this person's record in each.
      const editions = (await db.collection(EVENTS_COLLECTION).listDocuments()).filter((ref) => isEventId(ref.id));
      if (editions.length === 0) return ok([]);
      const records = await db.getAll(...editions.map((ref) => eventCollection(db, ref.id, EDITION_TEAM_COLLECTION).doc(uid)));
      const roles: Array<{ eventId: string; role: EditionRole }> = [];
      records.forEach((record, index) => {
        const role: unknown = record.data()?.role;
        if (isEditionRole(role)) roles.push({ eventId: editions[index].id, role });
      });
      return ok(roles);
    } catch (cause) {
      logServerError("admin.team.editionRolesOf", cause);
      return err(teamError("unknown"));
    }
  }

  async change(account: Account, role: ManagedRole | null): Promise<Result<{ previous: ManagedRole | null }, TeamError>> {
    try {
      const { db, global, edition } = await this.refs(account.uid);
      return await db.runTransaction(async (tx): Promise<Result<{ previous: ManagedRole | null }, TeamError>> => {
        const [globalDoc, editionDoc] = await Promise.all([tx.get(global), tx.get(edition)]);
        const previous = previousRole(globalDoc.data(), editionDoc.data());

        // Losing the admin role must leave another admin. The count is read in the same transaction,
        // so two admins removing each other at once cannot both succeed.
        if (previous === "admin" && role !== "admin") {
          const admins = await tx.get(db.collection(TEAM_COLLECTION).where("role", "==", "admin"));
          if (admins.size <= 1) return err(teamError("last-admin"));
        }

        const record = { email: account.email, displayName: account.displayName, role, updatedAt: new Date() };
        if (role === "admin") tx.set(global, record);
        else if (globalDoc.exists) tx.delete(global);
        if (role === "staff" || role === "organizer") tx.set(edition, record);
        else if (editionDoc.exists) tx.delete(edition);
        return ok({ previous });
      });
    } catch (cause) {
      logServerError("admin.team.change", cause);
      return err(teamError("unknown"));
    }
  }
}

/** The role a person holds now: admin from the global list, else their role in the edition, else an older global staff record. */
function previousRole(globalData: Doc, editionData: Doc): ManagedRole | null {
  if (isAdminRole(globalData?.role)) return "admin";
  const editionRole = editionData?.role;
  if (isEditionRole(editionRole)) return editionRole;
  const globalRole = globalData?.role;
  return isManagedRole(globalRole) ? globalRole : null;
}
