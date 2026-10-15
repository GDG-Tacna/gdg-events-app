import { describe, expect, it, vi } from "vitest";
import type { AuthSession } from "@/features/auth/server";
import { resolveSession, type EditionAccess, type EditionTeamRole } from "./session-role";

const claim = (role: AuthSession["role"]): AuthSession => ({ uid: "u1", role, displayName: "Ana", photoUrl: null, verifiedEmail: "ana@example.com" });

/** Teams by edition: `{ "devfest-2026": "staff" }` means u1 is staff there. The public edition is devfest-2026. */
function access(teams: Record<string, EditionTeamRole> = {}, publicId = "devfest-2026") {
  return {
    publicId: vi.fn(async () => publicId),
    roleIn: vi.fn(async (_uid: string, eventId: string) => teams[eventId] ?? null),
    rolesElsewhere: vi.fn(async () => Object.entries(teams).map(([eventId, role]) => ({ eventId, role }))),
  } satisfies EditionAccess;
}

describe("resolveSession", () => {
  it("keeps an admin global without reading any team, and lets it work in another edition", async () => {
    const edition = access();

    expect(await resolveSession(claim("admin"), edition)).toEqual({ uid: "u1", role: "admin", adminScope: "global", displayName: "Ana", photoUrl: null, verifiedEmail: "ana@example.com" });
    expect(await resolveSession(claim("admin"), edition, "meetup-nov")).toMatchObject({ role: "admin", adminScope: "global", workingEdition: "meetup-nov" });
    expect(edition.roleIn).not.toHaveBeenCalled();
  });

  it("treats asking for the public edition as no working edition", async () => {
    expect(await resolveSession(claim("admin"), access(), "devfest-2026")).not.toHaveProperty("workingEdition");
    expect(await resolveSession(claim("organizer"), access({ "devfest-2026": "organizer" }), "devfest-2026")).not.toHaveProperty("workingEdition");
  });

  it("leaves attendees and people without a role as they are, reading nothing", async () => {
    const edition = access();

    expect((await resolveSession(claim("attendee"), edition)).role).toBe("attendee");
    expect((await resolveSession(claim(null), edition)).role).toBeNull();
    expect(edition.publicId).not.toHaveBeenCalled();
  });

  it("trusts staff and organizers listed in the public edition", async () => {
    expect(await resolveSession(claim("staff"), access({ "devfest-2026": "staff" }))).toMatchObject({ role: "staff" });
    expect(await resolveSession(claim("organizer"), access({ "devfest-2026": "organizer" }))).toMatchObject({ role: "admin", adminScope: "edition" });
  });

  it("lets an organizer work in another edition only where it is organizer", async () => {
    expect(await resolveSession(claim("organizer"), access({ "meetup-nov": "organizer" }), "meetup-nov")).toMatchObject({ role: "admin", adminScope: "edition", workingEdition: "meetup-nov" });

    // Asked for an edition where it is only staff (or nothing): the cookie is ignored and the public edition decides.
    const onlyStaff = await resolveSession(claim("organizer"), access({ "meetup-nov": "staff", "devfest-2026": "organizer" }), "meetup-nov");
    expect(onlyStaff).toMatchObject({ role: "admin", adminScope: "edition" });
    expect(onlyStaff).not.toHaveProperty("workingEdition");
  });

  it("never lets staff work in another edition, even with a cookie", async () => {
    const session = await resolveSession(claim("staff"), access({ "meetup-nov": "organizer", "devfest-2026": "staff" }), "meetup-nov");

    expect(session).toMatchObject({ role: "staff" });
    expect(session).not.toHaveProperty("workingEdition");
  });

  it("says where else a staff or organizer has a role when the public edition does not list them", async () => {
    const session = await resolveSession(claim("organizer"), access({ "meetup-nov": "organizer", "taller-dic": "staff" }));

    expect(session).toMatchObject({ role: null, otherEditions: [{ eventId: "meetup-nov", role: "organizer" }, { eventId: "taller-dic", role: "staff" }] });
  });

  it("takes the role away from someone no edition lists, so they register as attendees", async () => {
    const session = await resolveSession(claim("staff"), access());

    expect(session.role).toBeNull();
    expect(session).not.toHaveProperty("otherEditions");
  });

  it("never gives more than the record says when the claim and the team disagree", async () => {
    expect(await resolveSession(claim("organizer"), access({ "devfest-2026": "staff" }))).toMatchObject({ role: "staff" });
    expect(await resolveSession(claim("staff"), access({ "devfest-2026": "organizer" }))).toMatchObject({ role: "staff" });
  });

  it("lets a failed read surface instead of guessing a role", async () => {
    const broken = { ...access(), roleIn: vi.fn(async () => Promise.reject(new Error("offline"))) };

    await expect(resolveSession(claim("staff"), broken)).rejects.toThrow("offline");
  });
});
