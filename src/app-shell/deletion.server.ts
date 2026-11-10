import "server-only";
import { mayDelete } from "@/features/event/server";
import { loadEditionSwitch } from "./event/working-edition.server";
import type { AppSession } from "./session-role";

/**
 * Whether this session may delete items (missions, zones, badges, squads, stations, ranks, cadets) in the edition it
 * works in: any admin while the edition is a draft, only an admin of every edition once it is published or finished.
 * An admin of every edition is never limited, so it is answered without reading the edition. When the edition cannot
 * be told the answer is no (a published edition's items are not to be lost by a failed read).
 */
export async function mayDeleteItems(session: Pick<AppSession, "role" | "adminScope"> & Partial<AppSession>): Promise<boolean> {
  if (session.role !== "admin") return false;
  if (session.adminScope === "global") return true;
  try {
    const switcher = await loadEditionSwitch(session as AppSession);
    return switcher?.current ? mayDelete(switcher.current.lifecycle, session) : false;
  } catch {
    return false;
  }
}
