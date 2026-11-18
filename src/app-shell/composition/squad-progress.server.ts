import "server-only";
import { squadProgressOf, type SquadProgressSource } from "@/features/missions/server";
import { err, ok } from "@/shared/lib/result";
import { attendeeDeps } from "./attendee.server";
import { networkStore } from "./network.server";
import { squadCatalog } from "./squads.server";

/**
 * The squads a cadet has met through their contacts (network feature) and the ones a «Conoce a alguien de cada
 * escuadrón» mission asks for. Derived on demand from the contacts and the cadets' own squads, so nothing extra is
 * stored: a contact made earlier counts, and a cadet who leaves the edition simply stops counting. Only cadets
 * (attendees) can be contacts, so a contact whose profile is not an attendee's is ignored.
 */
export const squadProgress: SquadProgressSource = async (uid) => {
  const [me, contacts, squads] = await Promise.all([attendeeDeps.attendees.findByUid(uid), networkStore.listFor(uid), squadCatalog.list()]);
  if (!me.ok || !contacts.ok || !squads.ok) return err({ code: "unknown" });

  const others = [...new Set(contacts.value.map((contact) => (contact.uids[0] === uid ? contact.uids[1] : contact.uids[0])))];
  const found = await Promise.all(others.map((other) => attendeeDeps.attendees.findByUid(other)));
  if (found.some((result) => !result.ok)) return err({ code: "unknown" });

  return ok(
    squadProgressOf({
      ownSquad: me.value?.role === "attendee" ? me.value.squad : null,
      squads: squads.value,
      contactSquads: found.flatMap((result) => (result.ok && result.value?.role === "attendee" ? [result.value.squad] : [])),
    }),
  );
};
