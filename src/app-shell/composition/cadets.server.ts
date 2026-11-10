import "server-only";
import { FirestoreAuditLog } from "@/features/admin/server";
import { createAlias } from "@/features/attendee";
import { FirebaseAccountDirectory, FirestoreCadetStore, type CadetsDeps } from "@/features/cadets/server";
import { err, ok } from "@/shared/lib/result";
import { squadStore } from "./squads.server";

/**
 * Composition root for managing the edition's cadets. The alias rules come from the attendee feature and the squads
 * from the squads catalog (read fresh: a squad made a moment ago must be choosable), so the cadets feature imports
 * neither; changes go to the admin audit trail.
 */
export const cadetsDeps: CadetsDeps = {
  store: new FirestoreCadetStore(),
  accounts: new FirebaseAccountDirectory(),
  aliases: { check: createAlias },
  squads: {
    exists: async (id) => {
      const listed = await squadStore.list();
      return listed.ok ? ok(listed.value.some((squad) => squad.id === id)) : err({ code: "unknown" });
    },
  },
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};
