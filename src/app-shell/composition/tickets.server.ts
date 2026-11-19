import "server-only";
import { FirebaseRoleDirectory, FirestoreAuditLog } from "@/features/admin/server";
import { FirestoreParticipantTicketStore, FirestoreTicketHolderStore, type ChangeTicketDeps, type ImportHoldersDeps } from "@/features/tickets/server";
import { err, ok } from "@/shared/lib/result";

const roleDirectory = new FirebaseRoleDirectory();

/** The edition's list of ticket holders: read when a cadet registers, written by the admin's import. */
export const ticketHolders = new FirestoreTicketHolderStore();

/** The ticket fields of the cadets' profiles. */
export const participantTickets = new FirestoreParticipantTicketStore();

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
