import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { HOLDERS_MAX_ROWS, importTicketHolders, parseHolderRows, summarizeTicketHolders, type ImportHoldersDeps } from "./holders";
import type { ParticipantTicket, TicketHolder } from "./ports";

describe("parseHolderRows", () => {
  it("reads comma separated lines with a header", () => {
    const parsed = parseHolderRows("correo,nombre,tipo\nAna@Example.com,Ana Torres,Premium\nluis@example.com,Luis Perez,pro\n");

    expect(parsed.rows).toEqual([
      { email: "ana@example.com", fullName: "Ana Torres", type: "premium" },
      { email: "luis@example.com", fullName: "Luis Perez", type: "pro" },
    ]);
    expect(parsed.invalid).toEqual([]);
    expect(parsed.counts).toEqual({ general: 0, pro: 1, premium: 1 });
  });

  it("reads the tabs of a paste from Excel and the semicolons of a Spanish CSV", () => {
    expect(parseHolderRows("ana@example.com\tAna Torres\tPremium").rows).toEqual([{ email: "ana@example.com", fullName: "Ana Torres", type: "premium" }]);
    expect(parseHolderRows("correo;nombre;tipo\nana@example.com;Ana Torres;Pro").rows).toEqual([{ email: "ana@example.com", fullName: "Ana Torres", type: "pro" }]);
  });

  it("ignores a byte order mark, blank lines and Windows line endings", () => {
    const parsed = parseHolderRows("﻿correo,nombre,tipo\r\n\r\nana@example.com,Ana,premium\r\n\r\n");

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.invalid).toEqual([]);
  });

  it("takes a missing or empty type as general", () => {
    const parsed = parseHolderRows("ana@example.com,Ana Torres\nluis@example.com,Luis Perez,");

    expect(parsed.rows.map((row) => row.type)).toEqual(["general", "general"]);
  });

  it("keeps a quoted name with a comma in it", () => {
    expect(parseHolderRows('ana@example.com,"Torres, Ana",pro').rows).toEqual([{ email: "ana@example.com", fullName: "Torres, Ana", type: "pro" }]);
  });

  it("follows the columns of the header when they are in another order", () => {
    expect(parseHolderRows("tipo,correo,nombre\npro,ana@example.com,Ana").rows).toEqual([{ email: "ana@example.com", fullName: "Ana", type: "pro" }]);
  });

  it("reports invalid emails and unknown types with their line number", () => {
    const parsed = parseHolderRows("correo,nombre,tipo\nnot-an-email,Ana,pro\nluis@example.com,Luis,vip\nok@example.com,Ok,premium");

    expect(parsed.rows).toEqual([{ email: "ok@example.com", fullName: "Ok", type: "premium" }]);
    expect(parsed.invalid).toEqual([
      { line: 2, reason: "email", value: "not-an-email" },
      { line: 3, reason: "type", value: "vip" },
    ]);
  });

  it("keeps the highest ticket when an email repeats with different ones, and says so", () => {
    const parsed = parseHolderRows("ana@example.com,Ana,general\nANA@example.com,Ana,premium\nana@example.com,Ana,pro");

    expect(parsed.rows).toEqual([{ email: "ana@example.com", fullName: "Ana", type: "premium" }]);
    expect(parsed.duplicates).toEqual([{ email: "ana@example.com", lines: [1, 2, 3], conflict: true, kept: "premium" }]);
  });

  it("reports an exact repeat without calling it a conflict", () => {
    const parsed = parseHolderRows("ana@example.com,Ana,pro\nana@example.com,Ana,pro");

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.duplicates).toEqual([{ email: "ana@example.com", lines: [1, 2], conflict: false, kept: "pro" }]);
  });

  it("gives an empty text no rows", () => {
    expect(parseHolderRows("")).toMatchObject({ rows: [], invalid: [], duplicates: [] });
  });
});

const holder = (email: string, type: TicketHolder["type"], fullName = "Name"): TicketHolder => ({ email, fullName, type });

function setup(options: { accounts?: Record<string, string>; participants?: Record<string, ParticipantTicket> } = {}) {
  const accounts = options.accounts ?? {};
  const participants = new Map(Object.entries(options.participants ?? {}));
  const deps = {
    holders: { get: vi.fn(), upsertMany: vi.fn(async (): Promise<Result<void, { code: string }>> => ok(undefined)), countByType: vi.fn(async () => ok({ general: 205, pro: 4, premium: 26 })) },
    participants: {
      get: vi.fn(async (uid: string) => ok(participants.get(uid) ?? null)),
      set: vi.fn(async (uid: string, ticket: { type: ParticipantTicket["type"]; source: ParticipantTicket["source"] }) => {
        const before = participants.get(uid);
        if (!before) return ok(null);
        participants.set(uid, { type: ticket.type, source: ticket.source, setBy: null, setAt: null });
        return ok({ before: before.type });
      }),
    },
    accounts: { findUidByEmail: vi.fn(async (email: string): Promise<Result<string | null, { code: string }>> => ok(accounts[email] ?? null)) },
    audit: { append: vi.fn(async () => ok(undefined)) },
    now: () => new Date("2026-11-19T10:00:00Z"),
  };
  return { deps: deps as unknown as ImportHoldersDeps & typeof deps, participants };
}

const admin = { uid: "admin-1", role: "admin" } as const;
const stored = (type: ParticipantTicket["type"], source: ParticipantTicket["source"]): ParticipantTicket => ({ type, source, setBy: null, setAt: null });

describe("importTicketHolders", () => {
  it("stores the list, applies it to registered cadets and audits the counts", async () => {
    const { deps, participants } = setup({ accounts: { "ana@example.com": "uid-ana" }, participants: { "uid-ana": stored("general", "default") } });

    const result = await importTicketHolders(deps, admin, [holder("ana@example.com", "premium"), holder("luis@example.com", "pro"), holder("eva@example.com", "general")]);

    expect(result).toEqual({ ok: true, value: { total: 3, counts: { general: 1, pro: 1, premium: 1 }, applied: 1, keptManual: 0, failed: 0 } });
    expect(deps.holders.upsertMany).toHaveBeenCalledWith(expect.arrayContaining([holder("ana@example.com", "premium")]));
    expect(participants.get("uid-ana")).toMatchObject({ type: "premium", source: "list" });
    expect(deps.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tickets.imported", actorUid: "admin-1", details: { total: "3", general: "1", pro: "1", premium: "1", applied: "1" } }),
    );
  });

  it("never overwrites a ticket that someone set by hand", async () => {
    const { deps, participants } = setup({ accounts: { "ana@example.com": "uid-ana" }, participants: { "uid-ana": stored("premium", "manual") } });

    const result = await importTicketHolders(deps, admin, [holder("ana@example.com", "general")]);

    expect(result).toMatchObject({ ok: true, value: { applied: 0, keptManual: 1 } });
    expect(deps.participants.set).not.toHaveBeenCalled();
    expect(participants.get("uid-ana")).toMatchObject({ type: "premium", source: "manual" });
  });

  it("skips accounts with no profile and cadets that already match the list", async () => {
    const { deps } = setup({ accounts: { "ana@example.com": "uid-ana", "luis@example.com": "uid-luis" }, participants: { "uid-ana": stored("pro", "list") } });

    const result = await importTicketHolders(deps, admin, [holder("ana@example.com", "pro"), holder("luis@example.com", "pro"), holder("nadie@example.com", "pro")]);

    expect(result).toMatchObject({ ok: true, value: { applied: 0, failed: 0 } });
    expect(deps.participants.set).not.toHaveBeenCalled();
  });

  it("counts the lookups that failed and still stores the list", async () => {
    const { deps } = setup();
    deps.accounts.findUidByEmail.mockResolvedValueOnce(err({ code: "unknown" }));

    const result = await importTicketHolders(deps, admin, [holder("ana@example.com", "pro")]);

    expect(result).toMatchObject({ ok: true, value: { total: 1, failed: 1 } });
    expect(deps.holders.upsertMany).toHaveBeenCalled();
  });

  it("validates the rows again and keeps the highest ticket of a repeated email", async () => {
    const { deps } = setup();

    expect(await importTicketHolders(deps, admin, [holder("not-an-email", "pro")])).toEqual({ ok: false, error: { code: "invalid-rows" } });
    expect(await importTicketHolders(deps, admin, [{ email: "ana@example.com", fullName: "A", type: "vip" as never }])).toEqual({ ok: false, error: { code: "invalid-rows" } });
    expect(deps.holders.upsertMany).not.toHaveBeenCalled();

    const result = await importTicketHolders(deps, admin, [holder("Ana@Example.com", "general"), holder("ana@example.com", "premium")]);
    expect(result).toMatchObject({ ok: true, value: { total: 1, counts: { premium: 1 } } });
  });

  it("refuses an empty import, one over the cap and anyone who is not an admin", async () => {
    const { deps } = setup();

    expect(await importTicketHolders(deps, admin, [])).toEqual({ ok: false, error: { code: "invalid-rows" } });
    const many = Array.from({ length: HOLDERS_MAX_ROWS + 1 }, (_, index) => holder(`p${index}@example.com`, "general"));
    expect(await importTicketHolders(deps, admin, many)).toEqual({ ok: false, error: { code: "too-many-rows" } });
    for (const role of ["staff", "attendee", null] as const) {
      expect(await importTicketHolders(deps, { uid: "x", role }, [holder("ana@example.com", "pro")])).toEqual({ ok: false, error: { code: "forbidden" } });
    }
    expect(deps.holders.upsertMany).not.toHaveBeenCalled();
  });

  it("reports an unwritable list as unknown and does not touch the cadets", async () => {
    const { deps } = setup();
    deps.holders.upsertMany.mockResolvedValueOnce(err({ code: "unknown" }));

    expect(await importTicketHolders(deps, admin, [holder("ana@example.com", "pro")])).toEqual({ ok: false, error: { code: "unknown" } });
    expect(deps.accounts.findUidByEmail).not.toHaveBeenCalled();
  });
});

describe("summarizeTicketHolders", () => {
  it("answers the totals of the list to an admin only", async () => {
    const { deps } = setup();

    expect(await summarizeTicketHolders(deps, admin)).toEqual({ ok: true, value: { general: 205, pro: 4, premium: 26 } });
    expect(await summarizeTicketHolders(deps, { uid: "s", role: "staff" })).toEqual({ ok: false, error: { code: "forbidden" } });
  });
});
