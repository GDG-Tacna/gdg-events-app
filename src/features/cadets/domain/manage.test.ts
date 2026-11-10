import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import {
  banCadet,
  changeCadetSquad,
  deleteCadet,
  getCadet,
  listCadets,
  renameCadet,
  unbanCadet,
  type CadetAccount,
  type CadetAuditEntry,
  type CadetPage,
  type CadetRecord,
  type CadetRemoval,
  type CadetsActor,
  type CadetsDeps,
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
  activity: { checkIns: 2, missions: 1, badges: 0, contacts: 0 },
  bannedAt: null,
  banReason: null,
};
const ACCOUNT: CadetAccount = { email: "nova@example.com", displayName: "Nova Cadet", role: "attendee", disabled: false };
const REMOVAL: CadetRemoval = { alias: "Nova", checkIns: 2, missions: 1, badges: 0, contacts: 0 };
const PAGE: CadetPage = { cadets: [RECORD], next: null, total: 1 };

interface Setup {
  record?: CadetRecord | null;
  account?: Result<CadetAccount | null, { code: string }>;
  rename?: Result<{ before: string } | "taken" | null, { code: string }>;
  squad?: Result<{ before: string | null } | null, { code: string }>;
  ban?: Result<{ wasBanned: boolean } | null, { code: string }>;
  remove?: Result<CadetRemoval | null, { code: string }>;
  squads?: Result<boolean, { code: string }>;
  disable?: Result<void, { code: string }>;
}

function setup({ record = RECORD, account = ok(ACCOUNT), rename = ok({ before: "Nova" }), squad = ok({ before: "firebase" }), ban = ok({ wasBanned: false }), remove = ok(REMOVAL), squads = ok(true), disable = ok(undefined) }: Setup = {}) {
  const entries: CadetAuditEntry[] = [];
  const deps = {
    store: {
      list: vi.fn(async (): Promise<Result<CadetPage, { code: string }>> => ok(PAGE)),
      get: vi.fn(async (): Promise<Result<CadetRecord | null, { code: string }>> => ok(record)),
      rename: vi.fn(async () => rename),
      setSquad: vi.fn(async () => squad),
      setBan: vi.fn(async () => ban),
      remove: vi.fn(async () => remove),
    },
    accounts: { lookup: vi.fn(async () => account), setDisabled: vi.fn(async () => disable) },
    aliases: { check: vi.fn((raw: string) => (raw.trim().length >= 3 ? ok({ display: raw.trim(), key: raw.trim().toLowerCase() }) : err("too-short"))) },
    squads: { exists: vi.fn(async () => squads) },
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
  it("asks for a page of the edition's cadets by the start of an alias, normalized", async () => {
    const { deps } = setup();

    expect(await listCadets(deps, ADMIN, { search: "  NoVa ", after: "mia" })).toEqual(ok(PAGE));

    expect(deps.store.list).toHaveBeenCalledWith({ search: "nova", after: "mia", limit: 25 });
  });

  it("starts from the beginning without a search or a cursor, and ignores a cursor that is absurdly long", async () => {
    const { deps } = setup();

    await listCadets(deps, ADMIN, {});
    await listCadets(deps, ADMIN, { search: "x".repeat(100), after: "y".repeat(100) });

    expect(deps.store.list).toHaveBeenNthCalledWith(1, { search: "", after: null, limit: 25 });
    expect(deps.store.list).toHaveBeenNthCalledWith(2, { search: "x".repeat(40), after: null, limit: 25 });
  });

  it("reports a failed read", async () => {
    const { deps } = setup();
    deps.store.list.mockResolvedValueOnce(err({ code: "x" }));

    expect(await listCadets(deps, ADMIN, {})).toEqual(err({ code: "unknown" }));
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
