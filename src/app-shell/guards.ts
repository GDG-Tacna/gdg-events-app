import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import {
  canAccess,
  readSession,
  readSessionCookie,
} from "@/features/auth/server";
import { publicEditionId, registerRequestEdition } from "@/features/event/server";
import { ROUTES, homeFor } from "@/shared/config/routes";
import { editionRoleOf, editionRolesOf, hasCadetProfile } from "./composition/admin.server";
import { authDeps } from "./composition/auth.server";
import { moduleOn } from "./modules.server";
import { resolveSession, type AppRole, type AppSession, type EditionAccess } from "./session-role";
import { linkedSpeaker, speakerDetour } from "./speakers/linked-speaker.server";
import { hasWorkingEditionCookie, readWorkingEdition } from "./working-edition.server";

export type { AppRole, AppSession } from "./session-role";

const editionAccess: EditionAccess = { publicId: publicEditionId, roleIn: (uid, eventId) => editionRoleOf(uid, eventId), rolesElsewhere: editionRolesOf };

/**
 * Verified session for the current request, or null, with its role resolved for the edition it works in: the public
 * one, or (in the control center) the working edition its signed cookie names, once the session may work there.
 * Staff and organizers only count while that edition's team lists them. Memoized per render pass.
 */
export const getSession = cache(async (): Promise<AppSession | null> => {
  const result = await readSession(authDeps, await readSessionCookie());
  if (!result.ok) return null;
  return resolveSession(result.value, editionAccess, await readWorkingEdition(result.value.uid));
});

// Every adapter resolves its edition through this: only a checked working edition ever replaces the public one. Without
// the cookie (every cadet, staff and stage request) it answers at once, without reading the session.
registerRequestEdition(async () => ((await hasWorkingEditionCookie()) ? ((await getSession())?.workingEdition ?? null) : null));

/**
 * What a team account (staff, organizer or admin) may do as a cadet in this edition: `"off"` when it is not a team
 * account or «Staff como cadetes» is off, `"play"` when it already has a cadet profile, `"join"` when it may sign up
 * as one. Read once per request.
 */
export const teamPlayState = cache(async (role: AppRole | null, uid: string): Promise<"off" | "join" | "play"> => {
  if (role !== "staff" && role !== "admin") return "off";
  if (!(await moduleOn("staffPlay"))) return "off";
  return (await hasCadetProfile(uid)) ? "play" : "join";
});

/** The cadet view of a session: a team account that plays is a cadet there (see `AppSession.playsAs`); anyone else is as they are. */
async function asCadet(session: AppSession): Promise<AppSession> {
  if (session.role === null || session.role === "attendee") return session;
  return (await teamPlayState(session.role, session.uid)) === "play" ? { ...session, role: "attendee", playsAs: session.role } : session;
}

/**
 * The session for the cadet's own actions (check in, answer a mission, vote, avatar...): a cadet as they are, and a team
 * account that plays as the cadet it also is. A team account that may not play keeps its real role, so those actions
 * refuse it as before.
 */
export async function getCadetSession(): Promise<AppSession | null> {
  const session = await getSession();
  return session ? asCadet(session) : null;
}

/** Where someone goes when they have no role here but do have one in another edition. */
function sendToTheirEditions(session: AppSession): void {
  if (session.role === null && session.otherEditions?.length) redirect(ROUTES.myEditions);
}

/**
 * Secure check close to the data (the proxy only does an optimistic cookie check).
 * Call it from pages, layouts that fetch data, and server actions.
 */
export async function requireSession(): Promise<AppSession> {
  const session = await getSession();
  if (!session) redirect(ROUTES.login);
  return session;
}

/**
 * Requires a session whose role may access the surface. A signed-in user without a role has not
 * finished onboarding and is sent there; any other mismatch behaves as not found.
 */
export async function requireRole(allowed: readonly AppRole[]): Promise<AppSession> {
  const session = await requireSession();
  sendToTheirEditions(session);
  if (session.role === null) redirect(ROUTES.onboarding);
  if (!canAccess(session.role, allowed)) notFound();
  return session;
}

/**
 * For the attendee screens (dashboard, scanner, pass). Visitors go to /login and people without a role to
 * onboarding. Staff and admin have their own home and are sent there instead of seeing an attendee screen
 * that has nothing for them.
 */
export async function requireAttendee(): Promise<AppSession> {
  const session = await requireSession();
  sendToTheirEditions(session);
  // A speaker who may not play, or who has no cadet profile yet, starts on their code screen.
  if ((await speakerDetour(session)) === "code") redirect(ROUTES.speaker);
  if (session.role === null) redirect(ROUTES.onboarding);
  if (session.role !== "attendee") {
    // A team account that plays sees the cadet screens as a cadet; one that does not goes to its own home.
    const playing = await asCadet(session);
    if (playing.role !== "attendee") redirect(homeFor(session.role));
    return playing;
  }
  return session;
}

/** For the onboarding page: needs a session, and sends users who already have a role to the dashboard. */
export async function requireOnboardingPending(): Promise<AppSession> {
  const session = await requireSession();
  // A staff or organizer of another edition must not sign up as a cadet here by mistake (it would replace their role).
  sendToTheirEditions(session);
  // A team account may sign up as a cadet where «Staff como cadetes» is on (and has not yet); anyone else with a role goes home.
  if (session.role !== null) {
    if ((await teamPlayState(session.role, session.uid)) === "join") return session;
    redirect(ROUTES.dashboard);
  }
  // A speaker signs up as a cadet only where speakers may play (their code screen offers it then).
  if ((await linkedSpeaker(session.uid)) && !(await moduleOn("speakerPlay"))) redirect(ROUTES.speaker);
  return session;
}
