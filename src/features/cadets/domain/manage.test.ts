import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import {
  banCadet,
  changeCadetSquad,
  deleteCadet,
  findCadetsForTicket,
  foldForSearch,
  getCadet,
  listCadets,
  maskEmail,
  matchesCadet,
  renameCadet,
  unbanCadet,
  type CadetAccount,
  type CadetAuditEntry,
  type CadetIdentity,
  type CadetPage,
  type CadetRecord,
  type CadetRemoval,
  type CadetsActor,
  type CadetsDeps,
  type IndexedCadet,
} from "./manage";

const NOW = new Date("2026-11-20T12:00:00Z");
const ADMIN: CadetsActor = { uid: "admin-0001", role: "admin", adminScope: "edition" };
const GLOBAL: CadetsActor = { uid: "admin-0002", role: "admin", adminScope: "global" };
const UID = "cadet-0001";

const RECORD: CadetRecord = {
  uid: UID,
  alias: "Nova",
  squad: "firebase",
  xp: 120,
  credits: 30,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  attendedAt: null,
  banned: false,
  ticket: "general",
  activity: { checkIns: 2, missions: 1, badges: 0, contacts: 0 },
  bannedAt: null,
  banReason: null,
  ticketSource: "default",
  ticketSetBy: null,
  ticketSetAt: null,
};
const ACCOUNT: CadetAccount = { email: "nova@example.com", displayName: "Nova Cadet", role: "attendee", disabled: false };
const REMOVAL: CadetRemoval = { alias: "Nova", checkIns: 2, missions: 1, badges: 0, contacts: 0 };
const PAGE: CadetPage = { cadets: [RECORD], next: null, total: 1 };

const cadetRow = (uid: string, alias: string, squad: string | null = null): IndexedCadet => ({
  uid,
  alias,
  aliasKey: alias.toLowerCase(),
  squad,
  ticket: "general",
  xp: 0,
  credits: 0,
  createdAt: null,
  attendedAt: null,
  banned: false,
});
/** The edition a search reads whole (out of alias order on purpose). */
const ALL: IndexedCadet[] = [cadetRow("u-nova", "Nova", "firebase"), cadetRow("u-mia", "Mia", "angular"), cadetRow("u-zeta", "Zeta", "firebase"), cadetRow("u-renee", "Renée", "old-squad")];
const IDENTITIES = new Map<string, CadetIdentity>([
  ["u-nova", { email: "nova@example.com", displayName: "Nova Cadet" }],
  ["u-mia", { email: "mia@uni.edu", displayName: null }],
  ["u-zeta", { email: "zeta@example.com", displayName: "José Pérez" }],
]);
const SQUAD_NAMES = new Map([
  ["firebase", "Firebase"],
  ["angular", "Angular"],
  ["old-squad", "Legado"],
]);

interface Setup {
  record?: CadetRecord | null;
  account?: Result<CadetAccount | null, { code: string }>;
  identities?: Result<ReadonlyMap<string, CadetIdentity>, { code: string }>;
  rename?: Result<{ before: string } | "taken" | null, { code: string }>;
  squad?: Result<{ before: string | null } | null, { code: string }>;
  ban?: Result<{ wasBanned: boolean } | null, { code: string }>;
  remove?: Result<CadetRemoval | null, { code: string }>;
  squads?: Result<boolean, { code: string }>;
  disable?: Result<void, { code: string }>;
}

function setup({ record = RECORD, account = ok(ACCOUNT), identities = ok(new Map<string, CadetIdentity>()), rename = ok({ before: "Nova" }), squad = ok({ before: "firebase" }), ban = ok({ wasBanned: false }), remove = ok(REMOVAL), squads = ok(true), disable = ok(undefined) }: Setup = {}) {
  const entries: CadetAuditEntry[] = [];
  const deps = {
    store: {
      list: vi.fn(async (): Promise<Result<CadetPage, { code: string }>> => ok(PAGE)),
      get: vi.fn(async (): Promise<Result<CadetRecord | null, { code: string }>> => ok(record)),
      rename: vi.fn(async () => rename),
      setSquad: vi.fn(async () => squad),
      setBan: vi.fn(async () => ban),
      remove: vi.fn(async () => remove),
      listAll: vi.fn(async (): Promise<Result<{ cadets: readonly IndexedCadet[]; total: number }, { code: string }>> => ok({ cadets: ALL, total: 9 })),
    },
    accounts: { lookup: vi.fn(async () => account), lookupMany: vi.fn(async () => identities), setDisabled: vi.fn(async () => disable) },
    aliases: { check: vi.fn((raw: string) => (raw.trim().length >= 3 ? ok({ display: raw.trim(), key: raw.trim().toLowerCase() }) : err("too-short"))) },
    squads: { exists: vi.fn(async () => squads), names: vi.fn(async (): Promise<Result<ReadonlyMap<string, string>, { code: string }>> => ok(SQUAD_NAMES)) },
    audit: { append: vi.fn(async (entry: CadetAuditEntry) => (entries.push(entry), ok(undefined))) },
    now: () => NOW,
  } satisfies CadetsDeps;
  return { deps, entries };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("everything is for admins only", () => {
  it.each([
    ["staff", { uid: "s1", role: "staff" }],
    ["an attendee", { uid: "u1", role: "attendee" }],
    ["no role", { uid: "x", role: null }],
  ] as const)("refuses %s", async (_who, actor) => {
    const { deps } = setup();
    const forbidden = err({ code: "forbidden" });

    expect(await listCadets(deps, actor, {})).toEqual(forbidden);
    expect(await getCadet(deps, actor, { uid: UID })).toEqual(forbidden);
    expect(await renameCadet(deps, actor, { uid: UID, alias: "Otro" })).toEqual(forbidden);
    expect(await changeCadetSquad(deps, actor, { uid: UID, squad: null })).toEqual(forbidden);
    expect(await banCadet(deps, actor, { uid: UID, reason: "Spam" })).toEqual(forbidden);
    expect(await unbanCadet(deps, actor, { uid: UID })).toEqual(forbidden);
    expect(await deleteCadet(deps, actor, { uid: UID })).toEqual(forbidden);

    expect(deps.store.rename).not.toHaveBeenCalled();
    expect(deps.accounts.setDisabled).not.toHaveBeenCalled();
    expect(deps.store.remove).not.toHaveBeenCalled();
  });
});

describe("listCadets", () => {
  it("without a search, asks for a page of the edition's cadets by alias", async () => {
    const { deps } = setup();

    await listCadets(deps, ADMIN, { search: "   ", after: "mia" });

    expect(deps.store.list).toHaveBeenCalledWith({ after: "mia", limit: 25 });
    expect(deps.store.listAll).not.toHaveBeenCalled();
  });

  it("adds each cadet's real name and email from their account, in one batch for the page", async () => {
    const { deps } = setup({ identities: ok(new Map([[RECORD.uid, { email: "nova@example.com", displayName: "Nova Real" }]])) });

    expect(await listCadets(deps, ADMIN, {})).toEqual(ok({ cadets: [{ ...RECORD, identity: { email: "nova@example.com", displayName: "Nova Real" } }], next: null, total: 1 }));
    expect(deps.accounts.lookupMany).toHaveBeenCalledTimes(1);
    expect(deps.accounts.lookupMany).toHaveBeenCalledWith([RECORD.uid]);
  });

  it("still lists the cadets, without name and email, when the accounts cannot be read or one is gone", async () => {
    const failing = setup({ identities: err({ code: "x" }) });
    const gone = setup({ identities: ok(new Map()) });

    expect(await listCadets(failing.deps, ADMIN, {})).toEqual(ok({ cadets: [{ ...RECORD, identity: null }], next: null, total: 1 }));
    expect(await listCadets(gone.deps, ADMIN, {})).toEqual(ok({ cadets: [{ ...RECORD, identity: null }], next: null, total: 1 }));
  });

  it("starts from the beginning without a cursor, and ignores a cursor that is absurdly long", async () => {
    const { deps } = setup();

    await listCadets(deps, ADMIN, {});
    await listCadets(deps, ADMIN, { after: "y".repeat(100) });

    expect(deps.store.list).toHaveBeenNthCalledWith(1, { after: null, limit: 25 });
    expect(deps.store.list).toHaveBeenNthCalledWith(2, { after: null, limit: 25 });
  });

  it("reports a failed read", async () => {
    const { deps } = setup();
    deps.store.list.mockResolvedValueOnce(err({ code: "x" }));

    expect(await listCadets(deps, ADMIN, {})).toEqual(err({ code: "unknown" }));
  });

  it("treats a search of fewer than 2 letters as no search (the box asks as the person types), and filters from 2", async () => {
    const { deps } = setup({ identities: ok(IDENTITIES) });

    await listCadets(deps, ADMIN, { search: "n" });
    await listCadets(deps, ADMIN, { search: " é " });
    expect(deps.store.list).toHaveBeenCalledTimes(2);
    expect(deps.store.listAll).not.toHaveBeenCalled();

    const listed = await listCadets(deps, ADMIN, { search: "no" });
    expect(deps.store.listAll).toHaveBeenCalledTimes(1);
    expect(listed.ok && listed.value.cadets.map((cadet) => cadet.alias)).toEqual(["Nova"]);
  });

  describe("with a search", () => {
    const search = (query: string, after: string | null = null, deps = setup({ identities: ok(IDENTITIES) }).deps) => listCadets(deps, ADMIN, { search: query, after });
    const aliases = async (query: string, after: string | null = null, deps?: CadetsDeps) => {
      const listed = await search(query, after, deps as ReturnType<typeof setup>["deps"] | undefined);
      return listed.ok ? listed.value.cadets.map((cadet) => cadet.alias) : listed;
    };

    it("finds by any part of the alias, ignoring case, accents and extra spaces", async () => {
      expect(await aliases("  OV ")).toEqual(["Nova"]);
      expect(await aliases("rene")).toEqual(["Renée"]);
    });

    it("finds by the account's name and email, and shows them on each match", async () => {
      expect(await aliases("jose")).toEqual(["Zeta"]);
      expect(await aliases("perez")).toEqual(["Zeta"]);
      expect(await aliases("@uni.edu")).toEqual(["Mia"]);

      const listed = await search("zeta");
      expect(listed.ok && listed.value.cadets[0]?.identity).toEqual({ email: "zeta@example.com", displayName: "José Pérez" });
    });

    it("finds by the squad's name or id, retired squads included", async () => {
      expect(await aliases("fire")).toEqual(["Nova", "Zeta"]);
      expect(await aliases("legado")).toEqual(["Renée"]);
      expect(await aliases("old-squad")).toEqual(["Renée"]);
    });

    it("orders by alias key and keeps the edition's total, not the matches", async () => {
      const { deps } = setup();
      deps.store.listAll.mockResolvedValue(ok({ cadets: ["Zeta", "Nova", "Renée", "Mia"].map((alias) => cadetRow(`u-${alias}`, `${alias} ab`)), total: 9 }));
      const listed = await listCadets(deps, ADMIN, { search: "ab" });

      expect(listed.ok && listed.value.cadets.map((cadet) => cadet.alias)).toEqual(["Mia ab", "Nova ab", "Renée ab", "Zeta ab"]);
      expect(listed.ok && listed.value.total).toBe(9);
      expect(listed.ok && "aliasKey" in (listed.value.cadets[0] ?? {})).toBe(false);
    });

    it("says it found nothing", async () => {
      expect(await aliases("zzz")).toEqual([]);
    });

    it("pages the matches with the alias key as the cursor", async () => {
      const { deps } = setup();
      const many: IndexedCadet[] = Array.from({ length: 30 }, (_, at) => cadetRow(`u-${at}`, `Cad${String(at).padStart(2, "0")}`));
      deps.store.listAll.mockResolvedValue(ok({ cadets: many, total: 30 }));

      const first = await listCadets(deps, ADMIN, { search: "cad" });
      expect(first.ok && first.value.cadets).toHaveLength(25);
      expect(first.ok && first.value.next).toBe("cad24");

      const second = await listCadets(deps, ADMIN, { search: "cad", after: "cad24" });
      expect(second.ok && second.value.cadets.map((cadet) => cadet.alias)).toEqual(["Cad25", "Cad26", "Cad27", "Cad28", "Cad29"]);
      expect(second.ok && second.value.next).toBeNull();
    });

    it("still finds by alias and squad id when the accounts or the squads' names cannot be read", async () => {
      const { deps } = setup({ identities: err({ code: "x" }) });
      deps.squads.names.mockResolvedValue(err({ code: "x" }));

      expect(await aliases("jose", null, deps)).toEqual([]);
      expect(await aliases("firebase", null, deps)).toEqual(["Nova", "Zeta"]);
      expect(await aliases("mi", null, deps)).toEqual(["Mia"]);
    });

    it("reads the accounts of every cadet of the edition in one lookup, and reports a failed read", async () => {
      const { deps } = setup({ identities: ok(IDENTITIES) });
      await listCadets(deps, ADMIN, { search: "xy" });
      expect(deps.accounts.lookupMany).toHaveBeenCalledTimes(1);
      expect(deps.accounts.lookupMany).toHaveBeenCalledWith(["u-nova", "u-mia", "u-zeta", "u-renee"]);

      deps.store.listAll.mockResolvedValueOnce(err({ code: "x" }));
      expect(await listCadets(deps, ADMIN, { search: "nova" })).toEqual(err({ code: "unknown" }));
    });
  });
});

describe("getCadet", () => {
  it("gives the cadet's record with the account behind it", async () => {
    const { deps } = setup();

    expect(await getCadet(deps, ADMIN, { uid: UID })).toEqual(ok({ cadet: RECORD, account: ACCOUNT }));
  });

  it("still shows the record when the account cannot be read", async () => {
    const { deps } = setup({ account: err({ code: "x" }) });

    expect(await getCadet(deps, ADMIN, { uid: UID })).toEqual(ok({ cadet: RECORD, account: null }));
  });

  it("is not found for an unknown or malformed cadet, and reports a failed read", async () => {
    expect(await getCadet(setup({ record: null }).deps, ADMIN, { uid: UID })).toEqual(err({ code: "not-found" }));
    expect(await getCadet(setup().deps, ADMIN, { uid: "no valid!" })).toEqual(err({ code: "not-found" }));
    const { deps } = setup();
    deps.store.get.mockResolvedValueOnce(err({ code: "x" }));
    expect(await getCadet(deps, ADMIN, { uid: UID })).toEqual(err({ code: "unknown" }));
  });
});

describe("renameCadet", () => {
  it("changes the alias with the rules of the attendee's own choice, and audits it", async () => {
    const { deps, entries } = setup();

    expect(await renameCadet(deps, ADMIN, { uid: UID, alias: "  Estrella " })).toEqual(ok("Estrella"));

    expect(deps.store.rename).toHaveBeenCalledWith(UID, { display: "Estrella", key: "estrella" });
    expect(entries).toEqual([{ action: "cadet.renamed", actorUid: ADMIN.uid, targetUid: UID, details: { from: "Nova", to: "Estrella" }, at: NOW }]);
  });

  it("writes no audit line when the alias is the same", async () => {
    const { deps, entries } = setup();

    expect(await renameCadet(deps, ADMIN, { uid: UID, alias: "Nova" })).toEqual(ok("Nova"));
    expect(entries).toEqual([]);
  });

  it("refuses an alias the rules refuse, one another cadet holds, and an unknown cadet", async () => {
    expect(await renameCadet(setup().deps, ADMIN, { uid: UID, alias: "ab" })).toEqual(err({ code: "invalid-alias" }));
    expect(await renameCadet(setup({ rename: ok("taken") }).deps, ADMIN, { uid: UID, alias: "Estrella" })).toEqual(err({ code: "alias-taken" }));
    expect(await renameCadet(setup({ rename: ok(null) }).deps, ADMIN, { uid: UID, alias: "Estrella" })).toEqual(err({ code: "not-found" }));
    expect(await renameCadet(setup().deps, ADMIN, { uid: "no valid!", alias: "Estrella" })).toEqual(err({ code: "not-found" }));
    expect(await renameCadet(setup({ rename: err({ code: "x" }) }).deps, ADMIN, { uid: UID, alias: "Estrella" })).toEqual(err({ code: "unknown" }));
  });
});

describe("changeCadetSquad", () => {
  it("moves the cadet to an existing squad and audits it", async () => {
    const { deps, entries } = setup();

    expect(await changeCadetSquad(deps, ADMIN, { uid: UID, squad: "angular" })).toEqual(ok(undefined));

    expect(deps.squads.exists).toHaveBeenCalledWith("angular");
    expect(deps.store.setSquad).toHaveBeenCalledWith(UID, "angular");
    expect(entries).toEqual([{ action: "cadet.squad", actorUid: ADMIN.uid, targetUid: UID, details: { from: "firebase", to: "angular" }, at: NOW }]);
  });

  it("takes the cadet out of their squad without asking for one", async () => {
    const { deps } = setup();

    expect(await changeCadetSquad(deps, ADMIN, { uid: UID, squad: null })).toEqual(ok(undefined));
    expect(deps.squads.exists).not.toHaveBeenCalled();
    expect(deps.store.setSquad).toHaveBeenCalledWith(UID, null);
  });

  it("writes no audit line when nothing changed, and refuses an unknown squad or cadet", async () => {
    const same = setup({ squad: ok({ before: "firebase" }) });
    await changeCadetSquad(same.deps, ADMIN, { uid: UID, squad: "firebase" });
    expect(same.entries).toEqual([]);

    expect(await changeCadetSquad(setup({ squads: ok(false) }).deps, ADMIN, { uid: UID, squad: "ghost" })).toEqual(err({ code: "unknown-squad" }));
    expect(await changeCadetSquad(setup({ squad: ok(null) }).deps, ADMIN, { uid: UID, squad: "angular" })).toEqual(err({ code: "not-found" }));
    expect(await changeCadetSquad(setup({ squads: err({ code: "x" }) }).deps, ADMIN, { uid: UID, squad: "angular" })).toEqual(err({ code: "unknown" }));
  });
});

describe("banCadet", () => {
  it("disables the account, marks the profile with the reason, and audits it", async () => {
    const { deps, entries } = setup();

    expect(await banCadet(deps, ADMIN, { uid: UID, reason: "  Cuenta   falsa " })).toEqual(ok(undefined));

    expect(deps.accounts.setDisabled).toHaveBeenCalledWith(UID, true);
    expect(deps.store.setBan).toHaveBeenCalledWith(UID, { reason: "Cuenta falsa", by: ADMIN.uid, at: NOW });
    expect(entries).toEqual([{ action: "cadet.banned", actorUid: ADMIN.uid, targetUid: UID, details: { alias: "Nova", reason: "Cuenta falsa" }, at: NOW }]);
  });

  it("disables the account before marking the profile, so a failed mark leaves the person out", async () => {
    const { deps } = setup({ ban: err({ code: "x" }) });
    const order: string[] = [];
    deps.accounts.setDisabled.mockImplementation(async () => (order.push("account"), ok(undefined)));
    deps.store.setBan.mockImplementation(async () => (order.push("profile"), err({ code: "x" })));

    expect(await banCadet(deps, ADMIN, { uid: UID, reason: "Spam" })).toEqual(err({ code: "unknown" }));
    expect(order).toEqual(["account", "profile"]);
  });

  it("refuses one's own account, a team member's, a missing or too short reason, and an unknown cadet", async () => {
    expect(await banCadet(setup().deps, { ...ADMIN, uid: UID }, { uid: UID, reason: "Spam" })).toEqual(err({ code: "own-account" }));
    for (const role of ["admin", "staff", "organizer"]) {
      const { deps } = setup({ account: ok({ ...ACCOUNT, role }) });
      expect(await banCadet(deps, ADMIN, { uid: UID, reason: "Spam" })).toEqual(err({ code: "protected-account" }));
      expect(deps.accounts.setDisabled).not.toHaveBeenCalled();
    }
    expect(await banCadet(setup().deps, ADMIN, { uid: UID, reason: "  " })).toEqual(err({ code: "invalid-reason" }));
    expect(await banCadet(setup().deps, ADMIN, { uid: UID, reason: "x".repeat(201) })).toEqual(err({ code: "invalid-reason" }));
    expect(await banCadet(setup({ record: null }).deps, ADMIN, { uid: UID, reason: "Spam" })).toEqual(err({ code: "not-found" }));
    expect(await banCadet(setup().deps, ADMIN, { uid: "no valid!", reason: "Spam" })).toEqual(err({ code: "not-found" }));
  });

  it("reports failures of the account, of its lookup and of the mark", async () => {
    expect(await banCadet(setup({ disable: err({ code: "x" }) }).deps, ADMIN, { uid: UID, reason: "Spam" })).toEqual(err({ code: "unknown" }));
    expect(await banCadet(setup({ account: err({ code: "x" }) }).deps, ADMIN, { uid: UID, reason: "Spam" })).toEqual(err({ code: "unknown" }));
    expect(await banCadet(setup({ ban: ok(null) }).deps, ADMIN, { uid: UID, reason: "Spam" })).toEqual(err({ code: "not-found" }));
  });
});

describe("unbanCadet", () => {
  it("enables the account, clears the mark and audits it", async () => {
    const { deps, entries } = setup();

    expect(await unbanCadet(deps, ADMIN, { uid: UID })).toEqual(ok(undefined));

    expect(deps.accounts.setDisabled).toHaveBeenCalledWith(UID, false);
    expect(deps.store.setBan).toHaveBeenCalledWith(UID, null);
    expect(entries).toEqual([{ action: "cadet.unbanned", actorUid: ADMIN.uid, targetUid: UID, details: { alias: "Nova" }, at: NOW }]);
  });

  it("is not found for an unknown cadet, and reports failures", async () => {
    expect(await unbanCadet(setup({ record: null }).deps, ADMIN, { uid: UID })).toEqual(err({ code: "not-found" }));
    expect(await unbanCadet(setup().deps, ADMIN, { uid: "no valid!" })).toEqual(err({ code: "not-found" }));
    expect(await unbanCadet(setup({ disable: err({ code: "x" }) }).deps, ADMIN, { uid: UID })).toEqual(err({ code: "unknown" }));
    expect(await unbanCadet(setup({ ban: err({ code: "x" }) }).deps, ADMIN, { uid: UID })).toEqual(err({ code: "unknown" }));
  });
});

describe("deleteCadet", () => {
  it("deletes the cadet for an admin of every edition and audits what went", async () => {
    const { deps, entries } = setup();

    expect(await deleteCadet(deps, GLOBAL, { uid: UID })).toEqual(ok(REMOVAL));

    expect(deps.store.remove).toHaveBeenCalledWith(UID);
    expect(entries).toEqual([
      { action: "cadet.deleted", actorUid: GLOBAL.uid, targetUid: UID, details: { alias: "Nova", checkIns: "2", missions: "1", badges: "0", contacts: "0" }, at: NOW },
    ]);
  });

  it("refuses an organizer, even one who may edit cadets, without touching anything", async () => {
    const { deps } = setup();

    expect(await deleteCadet(deps, ADMIN, { uid: UID })).toEqual(err({ code: "forbidden-delete" }));
    expect(deps.store.remove).not.toHaveBeenCalled();
  });

  it("refuses one's own account, an unknown cadet and a malformed id, and reports a failed delete", async () => {
    expect(await deleteCadet(setup().deps, { ...GLOBAL, uid: UID }, { uid: UID })).toEqual(err({ code: "own-account" }));
    expect(await deleteCadet(setup({ remove: ok(null) }).deps, GLOBAL, { uid: UID })).toEqual(err({ code: "not-found" }));
    expect(await deleteCadet(setup().deps, GLOBAL, { uid: "no valid!" })).toEqual(err({ code: "not-found" }));
    const failing = setup({ remove: err({ code: "x" }) });
    expect(await deleteCadet(failing.deps, GLOBAL, { uid: UID })).toEqual(err({ code: "unknown" }));
    expect(failing.entries).toEqual([]);
  });

  it("keeps the delete when only its audit line fails", async () => {
    const { deps } = setup();
    deps.audit.append.mockResolvedValueOnce(err({ code: "x" }) as never);

    expect(await deleteCadet(deps, GLOBAL, { uid: UID })).toEqual(ok(REMOVAL));
    expect(console.error).toHaveBeenCalled();
  });
});

describe("maskEmail", () => {
  it("keeps the first two characters of the local part and the whole domain", () => {
    expect(maskEmail("sebastian@gmail.com")).toBe("se•••••@gmail.com");
  });

  it("keeps one character of a very short local part, and hides everything of a text that is not an email", () => {
    expect(maskEmail("ab@x.com")).toBe("a•••••@x.com");
    expect(maskEmail("a@x.com")).toBe("a•••••@x.com");
    expect(maskEmail("not-an-email")).toBe("•••••");
    expect(maskEmail("@x.com")).toBe("•••••");
  });
});

describe("findCadetsForTicket", () => {
  const find = async (query: string, actor: CadetsActor = { uid: "s1", role: "staff" }, deps = setup({ identities: ok(IDENTITIES) }).deps) => findCadetsForTicket(deps, actor, query);
  const aliases = async (query: string) => {
    const found = await find(query);
    return found.ok ? found.value.map((hit) => hit.alias) : found;
  };

  it.each([
    ["an attendee", { uid: "u1", role: "attendee" }],
    ["no role", { uid: "x", role: null }],
  ] as const)("refuses %s, and reads nothing", async (_who, actor) => {
    const { deps } = setup({ identities: ok(IDENTITIES) });

    expect(await find("nova", actor, deps)).toEqual(err({ code: "forbidden" }));
    expect(deps.store.listAll).not.toHaveBeenCalled();
  });

  it("is open to staff and to admins", async () => {
    expect((await find("nova", { uid: "s1", role: "staff" })).ok).toBe(true);
    expect((await find("nova", ADMIN)).ok).toBe(true);
  });

  it("answers nothing for a text shorter than three characters, without reading the edition", async () => {
    const { deps } = setup({ identities: ok(IDENTITIES) });

    expect(await find("  no ", { uid: "s1", role: "staff" }, deps)).toEqual(ok([]));
    expect(deps.store.listAll).not.toHaveBeenCalled();
  });

  it("finds by alias, account name and email, ignoring case and accents", async () => {
    expect(await aliases("NOVA")).toEqual(["Nova"]);
    expect(await aliases("rené")).toEqual(["Renée"]);
    expect(await aliases("jose perez")).toEqual(["Zeta"]);
    expect(await aliases("@uni.edu")).toEqual(["Mia"]);
  });

  it("does not search the squads", async () => {
    expect(await aliases("firebase")).toEqual([]);
  });

  it("gives the name, the ticket and a masked email, never the full one", async () => {
    const found = await find("zeta");

    expect(found).toEqual(ok([{ uid: "u-zeta", alias: "Zeta", name: "José Pérez", email: "ze•••••@example.com", ticket: "general" }]));
    expect(JSON.stringify(found)).not.toContain("zeta@example.com");
  });

  it("leaves the name and email empty for a cadet whose account says none", async () => {
    const found = await find("renee");

    expect(found).toEqual(ok([{ uid: "u-renee", alias: "Renée", name: null, email: null, ticket: "general" }]));
  });

  it("orders by alias and stops at ten", async () => {
    const { deps } = setup({ identities: ok(new Map()) });
    const many: IndexedCadet[] = Array.from({ length: 15 }, (_, at) => cadetRow(`u-${at}`, `Cad${String(at).padStart(2, "0")}`));
    deps.store.listAll.mockResolvedValue(ok({ cadets: [...many].reverse(), total: 15 }));

    const found = await find("cad", { uid: "s1", role: "staff" }, deps);

    expect(found.ok && found.value.map((hit) => hit.alias)).toEqual(many.slice(0, 10).map((cadet) => cadet.alias));
  });

  it("still finds by alias when the accounts cannot be read, and reports a failed read of the edition", async () => {
    const failing = setup({ identities: err({ code: "x" }) });
    expect(await find("mia", { uid: "s1", role: "staff" }, failing.deps)).toEqual(ok([{ uid: "u-mia", alias: "Mia", name: null, email: null, ticket: "general" }]));
    expect(await find("jose", { uid: "s1", role: "staff" }, failing.deps)).toEqual(ok([]));

    const { deps } = setup();
    deps.store.listAll.mockResolvedValueOnce(err({ code: "x" }));
    expect(await find("nova", { uid: "s1", role: "staff" }, deps)).toEqual(err({ code: "unknown" }));
  });
});

describe("matchesCadet", () => {
  it("matches any of the fields, folded, and skips the missing ones", () => {
    expect(matchesCadet("jose", { alias: "Zeta", displayName: "José" })).toBe(true);
    expect(matchesCadet("jose", { alias: "Zeta", displayName: null, email: null, squadId: null })).toBe(false);
  });

  it("folds a search the same way as the fields", () => {
    expect(foldForSearch("  ÁNGEL   Ruiz ")).toBe("angel ruiz");
  });
});
