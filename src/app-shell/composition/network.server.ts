import "server-only";
import { attendeeDeps } from "@/app-shell/composition/attendee.server";
import { currentEconomy, rewardLedger } from "@/app-shell/composition/economy.server";
import { qrSigner } from "@/app-shell/composition/qr-signer.server";
import { squadCatalog } from "@/app-shell/composition/squads.server";
import { contactRewardFor } from "@/features/economy/server";
import { QrCodeEncoder } from "@/features/ephemeral-qr/server";
import { FirestoreNetworkStore, type CadetDirectory, type NetworkDeps } from "@/features/network/server";
import { err, ok } from "@/shared/lib/result";

/** Contacts and the links each cadet shows. */
export const networkStore = new FirestoreNetworkStore();

/**
 * Who the cadets are: the alias of each attendee registered in this edition (attendee feature) and their squad's
 * name (squads feature). Staff, admins and anyone not registered here are left out, so they can never be contacts.
 * The squad catalog is decoration: when it cannot be read the squad is simply not shown.
 */
export const cadetDirectory: CadetDirectory = {
  profiles: async (uids) => {
    const [found, squads] = await Promise.all([Promise.all([...new Set(uids)].map((uid) => attendeeDeps.attendees.findByUid(uid))), squadCatalog.list()]);
    if (found.some((result) => !result.ok)) return err({ code: "unknown" });
    const names = new Map(squads.ok ? squads.value.map((squad) => [squad.id, squad.name]) : []);
    const profiles = new Map<string, { alias: string; squad: string | null }>();
    for (const result of found) {
      const attendee = result.ok ? result.value : null;
      if (attendee && attendee.role === "attendee") profiles.set(attendee.uid, { alias: attendee.alias, squad: attendee.squad ? (names.get(attendee.squad) ?? null) : null });
    }
    return ok(profiles);
  },
};

/**
 * Composition root for the cadet network. Contact codes are signed with the same server secret as passes and
 * talk codes (a different signed text keeps them apart) and drawn with the same encoder; the reward per contact
 * comes from Economía and is paid through the reward ledger.
 */
export const networkDeps: NetworkDeps = {
  contacts: networkStore,
  cards: networkStore,
  cadets: cadetDirectory,
  signer: qrSigner,
  encoder: new QrCodeEncoder(),
  reward: async () => contactRewardFor(await currentEconomy()),
  ledger: rewardLedger,
  now: Date.now,
};
