import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import {
  SPEAKER_INVITE_TTL_MS,
  acceptSpeakerInvite,
  inviteSpeaker,
  listSpeakerAccess,
  maskSpeakerEmail,
  previewSpeakerInvite,
  speakerOfAccount,
  splitSpeakerToken,
  unlinkSpeaker,
  type SpeakerAccessDeps,
  type SpeakerAccessRow,
  type SpeakerInvite,
} from "./access";

vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const NOW = new Date("2026-10-20T15:00:00Z");
const SECRET = "s".repeat(43);
const ADMIN = { uid: "admin-1", role: "admin" };
const row = (speakerId: string, extra: Partial<SpeakerAccessRow> = {}): SpeakerAccessRow => ({ speakerId, name: `Speaker ${speakerId}`, active: true, accountUid: null, invite: null, ...extra });
const invite = (extra: Partial<SpeakerInvite> = {}): SpeakerInvite => ({ hash: `h:${SECRET}`, email: "ana@gmail.com", invitedBy: "admin-1", expiresAt: new Date(NOW.getTime() + 1000), acceptedAt: null, ...extra });

function setup(initial: SpeakerAccessRow[]) {
  const rows = new Map(initial.map((entry) => [entry.speakerId, entry]));
  const deps = {
    access: {
      rows: vi.fn(async () => ok([...rows.values()])),
      invite: vi.fn(async (id: string, next: SpeakerInvite) => {
        const found = rows.get(id);
        if (!found) return ok(false);
        rows.set(id, { ...found, invite: next, accountUid: null });
        return ok(true);
      }),
      claim: vi.fn(async (id: string, hash: string, uid: string, at: Date) => {
        const found = rows.get(id);
        if (!found?.invite || found.invite.hash !== hash || found.invite.acceptedAt) return ok("gone" as const);
        rows.set(id, { ...found, accountUid: uid, invite: { ...found.invite, acceptedAt: at } });
        return ok("linked" as const);
      }),
      unlink: vi.fn(async (id: string) => {
        const found = rows.get(id);
        if (!found) return ok(false);
        rows.set(id, { ...found, accountUid: null, invite: null });
        return ok(true);
      }),
    },
    audit: { append: vi.fn(async () => ok(undefined)) },
    newSecret: () => SECRET,
    hash: (secret: string) => `h:${secret}`,
    editionId: async () => "devfest-2026",
    now: () => NOW,
  } satisfies SpeakerAccessDeps;
  return { deps, rows };
}

describe("speaker links", () => {
  it("read the edition and the secret, and refuse anything else", () => {
    expect(splitSpeakerToken(`devfest-2026.${SECRET}`)).toEqual({ eventId: "devfest-2026", secret: SECRET });
    expect(splitSpeakerToken(SECRET)).toBeNull();
    expect(splitSpeakerToken(`Bad Event.${SECRET}`)).toBeNull();
    expect(splitSpeakerToken("devfest-2026.short")).toBeNull();
    expect(maskSpeakerEmail("ana.torres@gmail.com")).toBe("an•••@gmail.com");
  });
});

describe("inviteSpeaker", () => {
  it("makes a 14-day link for an active speaker's email, replacing the old one and any linked account", async () => {
    const t = setup([row("ana", { accountUid: "old-account", invite: invite({ hash: "h:old" }) })]);

    expect(await inviteSpeaker(t.deps, ADMIN, { speakerId: "ana", email: "  Ana@Gmail.com " })).toEqual(
      ok({ path: `/invite/speaker/devfest-2026.${SECRET}`, expiresAt: new Date(NOW.getTime() + SPEAKER_INVITE_TTL_MS) }),
    );
    expect(t.rows.get("ana")).toMatchObject({ accountUid: null, invite: { hash: `h:${SECRET}`, email: "ana@gmail.com", acceptedAt: null } });
    expect(t.deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "speaker.invited", targetUid: "ana" }));
  });

  it("is for admins, a valid email and an active speaker only", async () => {
    const t = setup([row("ana"), row("zoe", { active: false })]);

    expect(await inviteSpeaker(t.deps, { uid: "u1", role: "attendee" }, { speakerId: "ana", email: "ana@gmail.com" })).toEqual(err({ code: "forbidden" }));
    expect(await inviteSpeaker(t.deps, ADMIN, { speakerId: "ana", email: "ana" })).toEqual(err({ code: "invalid-email" }));
    expect(await inviteSpeaker(t.deps, ADMIN, { speakerId: "ghost", email: "ana@gmail.com" })).toEqual(err({ code: "not-found" }));
    expect(await inviteSpeaker(t.deps, ADMIN, { speakerId: "zoe", email: "zoe@gmail.com" })).toEqual(err({ code: "inactive" }));
    expect(t.deps.access.invite).not.toHaveBeenCalled();
  });
});

describe("acceptSpeakerInvite", () => {
  const session = { uid: "ana-account", verifiedEmail: "ana@gmail.com" };

  it("links the invited account once, and lets it come back through the same link", async () => {
    const t = setup([row("ana", { invite: invite() })]);

    expect(await acceptSpeakerInvite(t.deps, session, SECRET)).toEqual(ok({ speakerId: "ana" }));
    expect(t.rows.get("ana")?.accountUid).toBe("ana-account");
    expect(t.deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "speaker.linked", actorUid: "ana-account" }));

    expect(await acceptSpeakerInvite(t.deps, session, SECRET)).toEqual(ok({ speakerId: "ana" }));
    expect(await acceptSpeakerInvite(t.deps, { uid: "other", verifiedEmail: "ana@gmail.com" }, SECRET)).toEqual(err({ code: "used" }));
    expect(t.deps.access.claim).toHaveBeenCalledTimes(1);
  });

  it("needs the invited, verified email, an unexpired link, and an account not linked to another speaker", async () => {
    const t = setup([row("ana", { invite: invite() }), row("luis", { accountUid: "luis-account" })]);

    expect(await acceptSpeakerInvite(t.deps, { uid: "x", verifiedEmail: "otra@gmail.com" }, SECRET)).toEqual(err({ code: "wrong-account" }));
    expect(await acceptSpeakerInvite(t.deps, { uid: "x", verifiedEmail: null }, SECRET)).toEqual(err({ code: "unverified-email" }));
    expect(await acceptSpeakerInvite(t.deps, { uid: "luis-account", verifiedEmail: "ana@gmail.com" }, SECRET)).toEqual(err({ code: "already-linked" }));
    expect(await acceptSpeakerInvite(t.deps, session, "z".repeat(43))).toEqual(err({ code: "not-found" }));
    expect(await acceptSpeakerInvite(t.deps, session, "bad")).toEqual(err({ code: "not-found" }));

    const old = setup([row("ana", { invite: invite({ expiresAt: NOW }) })]);
    expect(await acceptSpeakerInvite(old.deps, session, SECRET)).toEqual(err({ code: "expired" }));
  });

  it("answers used when someone else claimed it first", async () => {
    const t = setup([row("ana", { invite: invite() })]);
    t.deps.access.claim.mockResolvedValueOnce(ok("gone"));

    expect(await acceptSpeakerInvite(t.deps, session, SECRET)).toEqual(err({ code: "used" }));
  });
});

describe("speaker access for the screens", () => {
  it("previews a link with the name, the email half hidden and its state", async () => {
    const t = setup([row("ana", { invite: invite() }), row("luis", { accountUid: "l1", invite: invite({ hash: "h:luis-secret-that-is-long-enough-123456", acceptedAt: NOW }) })]);

    expect(await previewSpeakerInvite(t.deps, SECRET)).toEqual(ok({ name: "Speaker ana", email: "an•••@gmail.com", state: "pending", accountUid: null }));
    expect(await previewSpeakerInvite(t.deps, "luis-secret-that-is-long-enough-123456")).toMatchObject({ ok: true, value: { state: "accepted", accountUid: "l1" } });
    expect(await previewSpeakerInvite(t.deps, "q".repeat(40))).toEqual(err({ code: "not-found" }));
  });

  it("lists each speaker's access for admins, and finds the speaker of an account", async () => {
    const t = setup([row("ana", { accountUid: "a1", invite: invite({ acceptedAt: NOW }) }), row("luis", { invite: invite({ email: "luis@gmail.com", expiresAt: NOW }) }), row("zoe")]);

    expect(await listSpeakerAccess(t.deps, ADMIN)).toEqual(
      ok({
        ana: { state: "linked", email: "an•••@gmail.com" },
        luis: { state: "invited", email: "lu•••@gmail.com", expiresAt: NOW, expired: true },
        zoe: { state: "none" },
      }),
    );
    expect(await listSpeakerAccess(t.deps, { role: "staff" })).toEqual(err({ code: "forbidden" }));
    expect(await speakerOfAccount(t.deps, "a1")).toEqual(ok({ id: "ana", name: "Speaker ana", active: true }));
    expect(await speakerOfAccount(t.deps, "nobody")).toEqual(ok(null));
  });

  it("takes a speaker's access away, audited", async () => {
    const t = setup([row("ana", { accountUid: "a1", invite: invite() })]);

    expect(await unlinkSpeaker(t.deps, ADMIN, { speakerId: "ana" })).toEqual(ok(undefined));
    expect(t.rows.get("ana")).toMatchObject({ accountUid: null, invite: null });
    expect(t.deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "speaker.unlinked" }));
    expect(await unlinkSpeaker(t.deps, ADMIN, { speakerId: "ghost" })).toEqual(err({ code: "not-found" }));
    expect(await unlinkSpeaker(t.deps, { uid: "u", role: "attendee" }, { speakerId: "ana" })).toEqual(err({ code: "forbidden" }));
  });
});
