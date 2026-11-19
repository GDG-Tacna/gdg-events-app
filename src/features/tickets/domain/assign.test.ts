import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { changeCadetTicket, resolveTicketFor, type ChangeTicketDeps } from "./assign";

vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

describe("resolveTicketFor", () => {
  const holders = (found: unknown) => ({ get: vi.fn(async () => found as never) });

  it("uses the ticket on the list", async () => {
    const deps = { holders: holders(ok({ email: "ana@example.com", fullName: "Ana", type: "premium" })) };

    expect(await resolveTicketFor(deps, " Ana@Example.com ")).toEqual({ type: "premium", source: "list" });
    expect(deps.holders.get).toHaveBeenCalledWith("ana@example.com");
  });

  it("is general by default when the email is not on the list", async () => {
    expect(await resolveTicketFor({ holders: holders(ok(null)) }, "ana@example.com")).toEqual({ type: "general", source: "default" });
  });

  it("is general by default without a verified email, without reading the list", async () => {
    const deps = { holders: holders(ok(null)) };

    expect(await resolveTicketFor(deps, null)).toEqual({ type: "general", source: "default" });
    expect(await resolveTicketFor(deps, undefined)).toEqual({ type: "general", source: "default" });
    expect(await resolveTicketFor(deps, "not-an-email")).toEqual({ type: "general", source: "default" });
    expect(deps.holders.get).not.toHaveBeenCalled();
  });

  it("does not fail the registration when the list cannot be read", async () => {
    expect(await resolveTicketFor({ holders: holders(err({ code: "unknown" })) }, "ana@example.com")).toEqual({ type: "general", source: "default" });
  });
});

function setup(before: "general" | "pro" | "premium" | null = "general") {
  const deps = {
    participants: { get: vi.fn(), set: vi.fn(async () => ok(before === null ? null : { before })) },
    audit: { append: vi.fn(async () => ok(undefined)) },
    now: () => new Date("2026-11-19T10:00:00Z"),
  };
  return deps as unknown as ChangeTicketDeps & typeof deps;
}

describe("changeCadetTicket", () => {
  it.each(["staff", "admin"] as const)("lets %s set the ticket by hand and audits the change", async (role) => {
    const deps = setup("general");

    const result = await changeCadetTicket(deps, { uid: "actor-1", role }, { uid: "cadet-1", type: "premium" });

    expect(result).toEqual({ ok: true, value: { before: "general" } });
    expect(deps.participants.set).toHaveBeenCalledWith("cadet-1", { type: "premium", source: "manual", by: "actor-1", at: new Date("2026-11-19T10:00:00Z") });
    expect(deps.audit.append).toHaveBeenCalledWith({
      action: "cadet.ticket",
      actorUid: "actor-1",
      targetUid: "cadet-1",
      details: { from: "general", to: "premium", via: role },
      at: new Date("2026-11-19T10:00:00Z"),
    });
  });

  it("does not audit when the ticket stays the same", async () => {
    const deps = setup("pro");

    expect(await changeCadetTicket(deps, { uid: "actor-1", role: "staff" }, { uid: "cadet-1", type: "pro" })).toMatchObject({ ok: true });
    expect(deps.audit.append).not.toHaveBeenCalled();
  });

  it("refuses an attendee and someone without a role before writing", async () => {
    const deps = setup();

    for (const role of ["attendee", null] as const) {
      expect(await changeCadetTicket(deps, { uid: "x", role }, { uid: "cadet-1", type: "premium" })).toEqual({ ok: false, error: { code: "forbidden" } });
    }
    expect(deps.participants.set).not.toHaveBeenCalled();
  });

  it("refuses a bad uid or ticket and reports a cadet that does not exist", async () => {
    const deps = setup();
    expect(await changeCadetTicket(deps, { uid: "a", role: "admin" }, { uid: "", type: "pro" })).toEqual({ ok: false, error: { code: "not-found" } });
    expect(await changeCadetTicket(deps, { uid: "a", role: "admin" }, { uid: "cadet-1", type: "vip" as never })).toEqual({ ok: false, error: { code: "invalid-ticket" } });

    const missing = setup(null);
    expect(await changeCadetTicket(missing, { uid: "a", role: "admin" }, { uid: "cadet-1", type: "pro" })).toEqual({ ok: false, error: { code: "not-found" } });
    expect(missing.audit.append).not.toHaveBeenCalled();
  });

  it("reports a failed write as unknown and a missing audit line does not undo the change", async () => {
    const failing = setup();
    failing.participants.set.mockResolvedValueOnce(err({ code: "unknown" }) as never);
    expect(await changeCadetTicket(failing, { uid: "a", role: "admin" }, { uid: "cadet-1", type: "pro" })).toEqual({ ok: false, error: { code: "unknown" } });

    const unaudited = setup();
    unaudited.audit.append.mockResolvedValueOnce(err({ code: "unknown" }) as never);
    expect(await changeCadetTicket(unaudited, { uid: "a", role: "admin" }, { uid: "cadet-1", type: "pro" })).toMatchObject({ ok: true });
  });
});
