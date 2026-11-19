import "server-only";
import { FirebaseRoleDirectory, FirestoreAuditLog } from "@/features/admin/server";
import { forgetCadetList } from "@/app-shell/composition/cadets.server";
import { FirestoreParticipantTicketStore, FirestoreTicketHolderStore, type ChangeTicketDeps, type ImportHoldersDeps, type ParticipantTicketStore } from "@/features/tickets/server";
import { err, ok } from "@/shared/lib/result";

const roleDirectory = new FirebaseRoleDirectory();

/** The edition's list of ticket holders: read when a cadet registers, written by the admin's import. */
export const ticketHolders = new FirestoreTicketHolderStore();

const storedTickets = new FirestoreParticipantTicketStore();

/** The ticket fields of the cadets' profiles; a change drops the kept list of cadets, which shows each one's ticket. */
export const participantTickets: ParticipantTicketStore = {
  get: (uid) => storedTickets.get(uid),
  set: async (uid, ticket) => {
    const written = await storedTickets.set(uid, ticket);
    if (written.ok) forgetCadetList();
    return written;
  },
};

/**
 * Composition root for tickets. The identity provider only answers which account signed in with an email (the admin
 * feature's directory already does), and changes go to the admin audit trail.
 */
export const ticketDeps: ImportHoldersDeps & ChangeTicketDeps = {
  holders: ticketHolders,
  participants: participantTickets,
  accounts: {
    findUidByEmail: async (email) => {
      const found = await roleDirectory.findByEmail(email);
      return found.ok ? ok(found.value?.uid ?? null) : err({ code: found.error.code });
    },
  },
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};
