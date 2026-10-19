import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { contactSigningInput, formatContactCode, isContactCode } from "./contact-code";
import { NO_LINKS, type ContactLinks } from "./links";
import {
  connectCadets,
  contactId,
  countContacts,
  getNetwork,
  issueContactCode,
  saveContactLinks,
  verifyContactCode,
  type Contact,
  type NetworkDeps,
} from "./network";

const NOW = Date.parse("2026-10-24T15:00:00Z");
const sign = (input: string) => createHmac("sha256", "test-secret").update(input).digest("base64url");
const signer = { sign, verify: (input: string, signature: string) => sign(input) === signature };
const ANA = { uid: "uid-ana", role: "attendee" } as const;
const BRUNO = "uid-bruno";

/** A real contact code of `uid`, valid for two minutes from `at`. */
const codeOf = (uid: string, at = NOW) => {
  const expiresAt = Math.floor(at / 1000) + 120;
  return formatContactCode(uid, expiresAt, sign(contactSigningInput(uid, expiresAt)));
};

function setup() {
  const contacts = new Map<string, Contact>();
  const links = new Map<string, ContactLinks>();
  const profiles = new Map([
    ["uid-ana", { alias: "Ana", squad: "Firebase" }],
    ["uid-bruno", { alias: "Bruno", squad: null }],
    ["uid-carla", { alias: "Carla", squad: "Angular" }],
  ]);
  const paid = new Map<string, { xp: number; credits: number }>();
  const slots = new Map<string, string[]>();
  let clock = NOW;
  const deps = {
    contacts: {
      connect: vi.fn(async (contact: Contact): Promise<Result<{ contact: Contact; created: boolean }, { code: string }>> => {
        const stored = contacts.get(contact.id);
        if (stored) return ok({ contact: stored, created: false });
        contacts.set(contact.id, contact);
        return ok({ contact, created: true });
      }),
      listFor: vi.fn(async (uid: string): Promise<Result<readonly Contact[], { code: string }>> => ok([...contacts.values()].filter((contact) => contact.uids.includes(uid)))),
      countFor: vi.fn(async (uid: string): Promise<Result<number, { code: string }>> => ok([...contacts.values()].filter((contact) => contact.uids.includes(uid)).length)),
      reserveRewardSlot: vi.fn(async (uid: string, other: string, cap: number): Promise<Result<boolean, { code: string }>> => {
        const taken = slots.get(uid) ?? [];
        if (taken.includes(other)) return ok(true);
        if (taken.length >= cap) return ok(false);
        slots.set(uid, [...taken, other]);
        return ok(true);
      }),
    },
    cards: {
      linksOf: vi.fn(async (uids: readonly string[]): Promise<Result<ReadonlyMap<string, ContactLinks>, { code: string }>> => ok(new Map(uids.map((uid) => [uid, links.get(uid) ?? NO_LINKS])))),
      saveLinks: vi.fn(async (uid: string, value: ContactLinks): Promise<Result<void, { code: string }>> => (links.set(uid, value), ok(undefined))),
    },
    cadets: {
      profiles: vi.fn(async (uids: readonly string[]): Promise<Result<ReadonlyMap<string, { alias: string; squad: string | null }>, { code: string }>> =>
        ok(new Map(uids.flatMap((uid) => (profiles.has(uid) ? [[uid, profiles.get(uid)!] as const] : [])))),
      ),
    },
    signer,
    encoder: { encode: vi.fn((text: string) => [text]) },
    reward: vi.fn(async () => ({ xp: 20, credits: 5, cap: 2 })),
    ledger: {
      grant: vi.fn(async (grant: { uid: string; source: string; xp: number; credits: number }): Promise<Result<{ granted: boolean }, { code: string }>> => {
        const key = `${grant.uid}_${grant.source}`;
        if (paid.has(key)) return ok({ granted: false });
        paid.set(key, { xp: grant.xp, credits: grant.credits });
        return ok({ granted: true });
      }),
    },
    now: () => clock,
  } satisfies NetworkDeps;
  return { deps, contacts, links, profiles, paid, tick: (ms: number) => (clock += ms) };
}

describe("contact codes", () => {
  it("issues a signed code for the cadet of the session, valid two minutes, and only for attendees", () => {
    const { deps } = setup();

    const issued = issueContactCode(deps, ANA);

    expect(issued).toEqual(ok({ cells: [codeOf("uid-ana")], issuedAt: NOW, expiresAt: NOW + 120_000 }));
    expect(isContactCode(codeOf("uid-ana"))).toBe(true);
    expect(issueContactCode(deps, { uid: "s1", role: "staff" })).toEqual(err({ code: "forbidden" }));
  });

  it("answers unknown when the code cannot be signed", () => {
    const { deps } = setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(issueContactCode({ ...deps, signer: { ...signer, sign: () => { throw new Error("no secret"); } } }, ANA)).toEqual(err({ code: "unknown" }));
  });

  it("knows a genuine code, and only says expired for a genuine one", () => {
    const { deps } = setup();
    const expired = codeOf(BRUNO, NOW - 121_000);
    const forged = codeOf(BRUNO).replace(/\.[^.]+$/, ".AAAAAAAAAAAAAAAAAAAAAAAA");

    expect(verifyContactCode(deps, codeOf(BRUNO))).toEqual(ok(BRUNO));
    expect(verifyContactCode(deps, expired)).toEqual(err({ code: "expired-code" }));
    expect(verifyContactCode(deps, forged)).toEqual(err({ code: "invalid-code" }));
    expect(verifyContactCode(deps, "devfest:at:uid-bruno.1.AAAAAAAAAAAAAAAAAAAA")).toEqual(err({ code: "invalid-code" }));
    // A code claiming to last far longer than one we would issue is not ours.
    expect(verifyContactCode(deps, codeOf(BRUNO, NOW + 3_600_000))).toEqual(err({ code: "invalid-code" }));
  });

  it("never accepts a pass signature as a contact code", () => {
    const { deps } = setup();
    const expiresAt = Math.floor(NOW / 1000) + 60;

    expect(verifyContactCode(deps, formatContactCode(BRUNO, expiresAt, sign(`pass:${BRUNO}.${expiresAt}`)))).toEqual(err({ code: "invalid-code" }));
  });
});

describe("connectCadets", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("makes the two cadets contacts, shows the other's card and pays both", async () => {
    ctx.links.set(BRUNO, { linkedin: null, github: "https://github.com/bruno", web: null });

    const result = await connectCadets(ctx.deps, ANA, codeOf(BRUNO));

    expect(result).toEqual(
      ok({ card: { alias: "Bruno", squad: null, links: { linkedin: null, github: "https://github.com/bruno", web: null } }, created: true, xpEarned: 20, creditsEarned: 5, capReached: false }),
    );
    expect(ctx.contacts.get("uid-ana_uid-bruno")).toEqual({ id: "uid-ana_uid-bruno", uids: ["uid-ana", "uid-bruno"], scannedBy: "uid-ana", createdAt: new Date(NOW) });
    expect(ctx.deps.ledger.grant).toHaveBeenCalledWith({ uid: "uid-ana", source: "contact:uid-bruno", xp: 20, credits: 5 });
    expect(ctx.deps.ledger.grant).toHaveBeenCalledWith({ uid: "uid-bruno", source: "contact:uid-ana", xp: 20, credits: 5 });
  });

  it("is one contact per pair, whoever scans, and pays nothing twice", async () => {
    await connectCadets(ctx.deps, ANA, codeOf(BRUNO));

    const again = await connectCadets(ctx.deps, { uid: BRUNO, role: "attendee" }, codeOf("uid-ana"));

    expect(again).toMatchObject({ ok: true, value: { created: false, xpEarned: 0, creditsEarned: 0, capReached: false } });
    expect(ctx.contacts.size).toBe(1);
    expect(ctx.paid.size).toBe(2);
  });

  it("retries a payment that failed on the next scan of the pair", async () => {
    ctx.deps.ledger.grant.mockResolvedValueOnce(err({ code: "unknown" }));
    expect(await connectCadets(ctx.deps, ANA, codeOf(BRUNO))).toMatchObject({ ok: true, value: { xpEarned: 0 } });

    expect(await connectCadets(ctx.deps, ANA, codeOf(BRUNO))).toMatchObject({ ok: true, value: { created: false, xpEarned: 20, creditsEarned: 5 } });
  });

  it("pays only the first contacts up to the cap, by when they were made, for each cadet", async () => {
    ctx.profiles.set("uid-dora", { alias: "Dora", squad: null });
    await connectCadets(ctx.deps, ANA, codeOf(BRUNO));
    ctx.tick(1000);
    await connectCadets(ctx.deps, ANA, codeOf("uid-carla"));
    ctx.tick(1000);

    expect(ctx.paid.has("uid-ana_contact:uid-carla")).toBe(true);

    const third = await connectCadets(ctx.deps, ANA, codeOf("uid-dora"));

    expect(third).toMatchObject({ ok: true, value: { created: true, xpEarned: 0, creditsEarned: 0, capReached: true } });
    // Dora's first contact still pays her.
    expect(ctx.paid.has("uid-dora_contact:uid-ana")).toBe(true);
    expect(ctx.paid.has("uid-ana_contact:uid-dora")).toBe(false);
  });

  it("never pays a cadet past the cap when many cadets scan their code at the same moment", async () => {
    for (const uid of ["uid-dora", "uid-eli", "uid-fito"]) ctx.profiles.set(uid, { alias: uid, squad: null });
    const scanners = [BRUNO, "uid-carla", "uid-dora", "uid-eli", "uid-fito"];

    await Promise.all(scanners.map((uid) => connectCadets(ctx.deps, { uid, role: "attendee" as const }, codeOf("uid-ana"))));

    expect(scanners.filter((uid) => ctx.paid.has(`uid-ana_contact:${uid}`))).toHaveLength(2);
    // Every scanner's own first contact still pays them.
    expect(scanners.every((uid) => ctx.paid.has(`${uid}_contact:uid-ana`))).toBe(true);
    expect(ctx.deps.contacts.reserveRewardSlot).toHaveBeenCalledWith("uid-ana", BRUNO, 2);
  });

  it("pays nothing, and asks nothing of the ledger, when contacts give no reward", async () => {
    ctx.deps.reward.mockResolvedValue({ xp: 0, credits: 0, cap: 10 });

    expect(await connectCadets(ctx.deps, ANA, codeOf(BRUNO))).toMatchObject({ ok: true, value: { created: true, xpEarned: 0, capReached: false } });
    expect(ctx.deps.ledger.grant).not.toHaveBeenCalled();
  });

  it("keeps the contact when the reward cannot be checked", async () => {
    ctx.deps.contacts.reserveRewardSlot.mockResolvedValue(err({ code: "unknown" }));

    expect(await connectCadets(ctx.deps, ANA, codeOf(BRUNO))).toMatchObject({ ok: true, value: { created: true, xpEarned: 0, capReached: false } });
    expect(ctx.deps.ledger.grant).not.toHaveBeenCalled();
  });

  it.each([
    ["the cadet's own code", () => codeOf("uid-ana"), "self"],
    ["a code of someone not in this edition", () => codeOf("uid-ghost"), "unknown-cadet"],
    ["an expired code", () => codeOf(BRUNO, NOW - 200_000), "expired-code"],
    ["something else", () => "https://example.com", "invalid-code"],
  ])("refuses %s and makes no contact", async (_, code, expected) => {
    expect(await connectCadets(ctx.deps, ANA, code())).toEqual(err({ code: expected }));
    expect(ctx.deps.contacts.connect).not.toHaveBeenCalled();
  });

  it("is only for registered attendees", async () => {
    expect(await connectCadets(ctx.deps, { uid: "s1", role: "staff" }, codeOf(BRUNO))).toEqual(err({ code: "forbidden" }));
    expect(await connectCadets(ctx.deps, { uid: "uid-new", role: "attendee" }, codeOf(BRUNO))).toEqual(err({ code: "not-registered" }));
  });

  it("reports failed reads and writes", async () => {
    ctx.deps.cadets.profiles.mockResolvedValueOnce(err({ code: "x" }));
    expect(await connectCadets(ctx.deps, ANA, codeOf(BRUNO))).toEqual(err({ code: "unknown" }));
    ctx.deps.cards.linksOf.mockResolvedValueOnce(err({ code: "x" }));
    expect(await connectCadets(ctx.deps, ANA, codeOf(BRUNO))).toEqual(err({ code: "unknown" }));
    ctx.deps.contacts.connect.mockResolvedValueOnce(err({ code: "x" }));
    expect(await connectCadets(ctx.deps, ANA, codeOf(BRUNO))).toEqual(err({ code: "unknown" }));
  });
});

describe("getNetwork", () => {
  it("shows the cadet's own card and their contacts, newest first, with the reward", async () => {
    const ctx = setup();
    ctx.links.set("uid-ana", { linkedin: "https://www.linkedin.com/in/ana", github: null, web: null });
    await connectCadets(ctx.deps, ANA, codeOf(BRUNO));
    ctx.tick(5000);
    await connectCadets(ctx.deps, { uid: "uid-carla", role: "attendee" }, codeOf("uid-ana"));

    const network = await getNetwork(ctx.deps, ANA);

    expect(network).toEqual(
      ok({
        me: { alias: "Ana", squad: "Firebase", links: { linkedin: "https://www.linkedin.com/in/ana", github: null, web: null } },
        contacts: [
          { id: contactId("uid-ana", "uid-carla"), alias: "Carla", squad: "Angular", links: NO_LINKS, connectedAt: new Date(NOW + 5000) },
          { id: contactId("uid-ana", BRUNO), alias: "Bruno", squad: null, links: NO_LINKS, connectedAt: new Date(NOW) },
        ],
        reward: { xp: 20, credits: 5, cap: 2 },
      }),
    );
    expect(await countContacts(ctx.deps, "uid-ana")).toEqual(ok(2));
  });

  it("leaves out a contact whose cadet is no longer in the edition", async () => {
    const ctx = setup();
    await connectCadets(ctx.deps, ANA, codeOf(BRUNO));
    ctx.profiles.delete(BRUNO);

    expect(await getNetwork(ctx.deps, ANA)).toMatchObject({ ok: true, value: { contacts: [] } });
  });

  it("is only for registered attendees, and reports failed reads", async () => {
    const ctx = setup();
    expect(await getNetwork(ctx.deps, { uid: "a1", role: "admin" })).toEqual(err({ code: "forbidden" }));
    expect(await getNetwork(ctx.deps, { uid: "uid-new", role: "attendee" })).toEqual(err({ code: "not-registered" }));
    ctx.deps.contacts.listFor.mockResolvedValueOnce(err({ code: "x" }));
    expect(await getNetwork(ctx.deps, ANA)).toEqual(err({ code: "unknown" }));
    expect(await countContacts({ contacts: { ...ctx.deps.contacts, countFor: async () => err({ code: "x" }) } }, "uid-ana")).toEqual(err({ code: "unknown" }));
  });
});

describe("saveContactLinks", () => {
  it("saves the links the cadet chose, in their stored form", async () => {
    const ctx = setup();

    const saved = await saveContactLinks(ctx.deps, ANA, { linkedin: "", github: "octocat", web: "ana.dev" });

    expect(saved).toEqual(ok({ linkedin: null, github: "https://github.com/octocat", web: "https://ana.dev/" }));
    expect(ctx.links.get("uid-ana")).toEqual({ linkedin: null, github: "https://github.com/octocat", web: "https://ana.dev/" });
  });

  it("says which link is wrong and saves nothing", async () => {
    const ctx = setup();

    expect(await saveContactLinks(ctx.deps, ANA, { github: "https://evil.com/x" })).toEqual(err({ code: "invalid-github" }));
    expect(await saveContactLinks(ctx.deps, ANA, { web: "javascript:alert(1)" })).toEqual(err({ code: "invalid-web" }));
    expect(await saveContactLinks(ctx.deps, ANA, { linkedin: "https://linkedin.com/company/x" })).toEqual(err({ code: "invalid-linkedin" }));
    expect(ctx.deps.cards.saveLinks).not.toHaveBeenCalled();
  });

  it("is only for registered attendees", async () => {
    const ctx = setup();
    expect(await saveContactLinks(ctx.deps, { uid: "s1", role: "staff" }, {})).toEqual(err({ code: "forbidden" }));
    expect(await saveContactLinks(ctx.deps, { uid: "uid-new", role: "attendee" }, {})).toEqual(err({ code: "not-registered" }));
    ctx.deps.cards.saveLinks.mockResolvedValueOnce(err({ code: "x" }));
    expect(await saveContactLinks(ctx.deps, ANA, {})).toEqual(err({ code: "unknown" }));
  });
});
