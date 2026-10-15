import "server-only";
import type { EditionChoice } from "@/features/event";
import { listEditionChoices } from "@/features/event/server";
import { editionRolesOf } from "../composition/admin.server";
import { editionsDeps } from "../composition/event.server";
import type { AppSession } from "../session-role";

/**
 * Which editions a session may work in: every one for an admin of all of them; for an organizer, the editions where
 * the team lists it as organizer (read fresh, never from the session's cache). Anyone else: none.
 */
export async function allowedEditions(session: AppSession): Promise<"all" | readonly string[] | null> {
  if (session.role === "admin" && session.adminScope === "global") return "all";
  const organizerSomewhere = (session.role === "admin" && session.adminScope === "edition") || session.otherEditions?.some((entry) => entry.role === "organizer");
  if (!organizerSomewhere) return null;
  const roles = await editionRolesOf(session.uid);
  return roles.filter((entry) => entry.role === "organizer").map((entry) => entry.eventId);
}

/** What the control center's selector shows: the editions this session may pick and the one it works in now. */
export async function loadEditionSwitch(session: AppSession): Promise<{ choices: readonly EditionChoice[]; current: EditionChoice | null } | null> {
  const allowed = await allowedEditions(session);
  if (allowed === null) return null;
  const choices = await listEditionChoices(editionsDeps, allowed);
  if (!choices.ok) throw new Error("Could not read the editions");
  const current = choices.value.find((choice) => (session.workingEdition ? choice.id === session.workingEdition : choice.isPublic)) ?? null;
  return { choices: choices.value, current };
}
