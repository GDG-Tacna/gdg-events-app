import { err, ok, type Result } from "@/shared/lib/result";
import type { Communication } from "./communication";

/** The communications the edition has saved (active and inactive). Empty until the admin saves or seeds them. */
export interface CommunicationSource {
  list(): Promise<Result<readonly Communication[], { code: string }>>;
}

/** What the missions feature knows: which missions an attendee completed, and every mission's title. */
export interface MissionProgress {
  completedIds(uid: string): Promise<Result<ReadonlySet<string>, { code: string }>>;
  titles(): Promise<Result<ReadonlyMap<string, string>, { code: string }>>;
}

export interface OdysseyDeps {
  source: CommunicationSource;
  progress: MissionProgress;
  /** The bundled communications, served until the edition saves its own. */
  defaults: readonly Communication[];
}

export interface OdysseyError {
  code: "unknown";
}

/**
 * A transmission as one attendee sees it. A locked one carries its title and what opens it, never its
 * text: the story is only sent once the attendee has earned it.
 */
export type Transmission =
  | { id: string; quadrantId: string; title: string; status: "open"; body: string }
  | { id: string; quadrantId: string; title: string; status: "locked"; unlockMission: string };

export interface OdysseyLog {
  transmissions: readonly Transmission[];
  open: number;
  total: number;
}

const byOrder = (a: Communication, b: Communication) => a.order - b.order || a.title.localeCompare(b.title);

/**
 * The attendee's log of the Odisea de Código: the active communications in order, open when they need no
 * mission or the attendee completed theirs, locked otherwise with the mission that opens them.
 */
export async function getOdyssey(deps: OdysseyDeps, uid: string): Promise<Result<OdysseyLog, OdysseyError>> {
  const [listed, completed, titles] = await Promise.all([deps.source.list(), deps.progress.completedIds(uid), deps.progress.titles()]);
  if (!listed.ok || !completed.ok || !titles.ok) return err({ code: "unknown" });

  const communications = (listed.value.length > 0 ? listed.value : deps.defaults).filter((communication) => communication.active).sort(byOrder);
  const transmissions = communications.map((communication): Transmission => {
    const { id, quadrantId, title, unlockMissionId } = communication;
    if (unlockMissionId === null || completed.value.has(unlockMissionId)) return { id, quadrantId, title, status: "open", body: communication.body };
    return { id, quadrantId, title, status: "locked", unlockMission: titles.value.get(unlockMissionId) ?? unlockMissionId };
  });

  return ok({ transmissions, open: transmissions.filter((transmission) => transmission.status === "open").length, total: transmissions.length });
}
