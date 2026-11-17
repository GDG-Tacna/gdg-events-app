import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { NO_FOOD_REQUIREMENTS } from "./food-gate";
import type { ManagedCheckpoint } from "./manage";
import { STAFF_SCOPE_MAX, listStaffScopes, setStaffScope, staffScopeError, type StaffScopeDeps } from "./staff-scope";

vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const NOW = new Date("2026-11-16T15:00:00Z");
const ADMIN = { uid: "a1", role: "admin" as const };
const point = (id: string, kind: ManagedCheckpoint["kind"], active = true): ManagedCheckpoint => ({ id, kind, name: id, active, description: "", image: null, requirements: NO_FOOD_REQUIREMENTS });
const CHECKPOINTS = [point("entrada-norte", "entrance"), point("almuerzo", "catering"), point("stand-louis", "stand"), point("stand-old", "stand", false), point("talk-keynote", "talk")];

function setup({ listed = ok(CHECKPOINTS) as Result<readonly ManagedCheckpoint[], { code: string }>, saved = ok(undefined) as Result<void, { code: string }>, audited = ok(undefined) as Result<void, { code: string }> } = {}) {
  const scopes = {
    read: vi.fn(async () => ok(null)),
    list: vi.fn(async () => ok({ s1: ["stand-louis"] })),
    save: vi.fn(async () => saved),
  };
  const checkpoints = { list: vi.fn(async () => listed) };
  const audit = { append: vi.fn(async () => audited) };
  const deps: StaffScopeDeps = { scopes, checkpoints, audit, now: () => NOW };
  return { deps, scopes, checkpoints, audit };
}

describe("setStaffScope", () => {
  it("limits a staff account to some stations of the edition, saves who did it and audits it", async () => {
    const t = setup();

    expect(await setStaffScope(t.deps, ADMIN, { uid: "s1", checkpointIds: ["stand-louis", "stand-old", "stand-louis"] })).toEqual(ok(["stand-louis", "stand-old"]));
    expect(t.scopes.save).toHaveBeenCalledWith("s1", ["stand-louis", "stand-old"], { by: "a1", at: NOW });
    expect(t.audit.append).toHaveBeenCalledWith({ action: "team.staff-scope", actorUid: "a1", targetUid: "s1", details: { checkpoints: "stand-louis,stand-old" }, at: NOW });
  });

  it("lifts the limit without reading the checkpoints, and audits that too", async () => {
    const t = setup();

    expect(await setStaffScope(t.deps, ADMIN, { uid: "s1", checkpointIds: null })).toEqual(ok(null));
    expect(t.checkpoints.list).not.toHaveBeenCalled();
    expect(t.scopes.save).toHaveBeenCalledWith("s1", null, { by: "a1", at: NOW });
    expect(t.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "team.staff-scope", details: { checkpoints: null } }));
  });

  it.each([
    ["no station", []],
    ["a talk", ["talk-keynote"]],
    ["a checkpoint that does not exist", ["stand-ghost"]],
    ["too many", Array.from({ length: STAFF_SCOPE_MAX + 1 }, (_, n) => `stand-${n}`)],
  ])("refuses %s, and saves nothing", async (_label, checkpointIds) => {
    const t = setup();

    expect(await setStaffScope(t.deps, ADMIN, { uid: "s1", checkpointIds })).toEqual(err(staffScopeError("invalid-scope")));
    expect(t.scopes.save).not.toHaveBeenCalled();
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("is for admins only (an organizer is one), and needs a person", async () => {
    const t = setup();

    expect(await setStaffScope(t.deps, { uid: "s2", role: "staff" }, { uid: "s1", checkpointIds: null })).toEqual(err(staffScopeError("forbidden")));
    expect(await setStaffScope(t.deps, ADMIN, { uid: "", checkpointIds: null })).toEqual(err(staffScopeError("not-found")));
    expect(await setStaffScope(t.deps, ADMIN, { uid: "a/b", checkpointIds: null })).toEqual(err(staffScopeError("not-found")));
    expect(t.scopes.save).not.toHaveBeenCalled();
  });

  it("reports a failed read or write as unknown, without an audit line for what did not happen", async () => {
    const unreadable = setup({ listed: err({ code: "unknown" }) });
    expect(await setStaffScope(unreadable.deps, ADMIN, { uid: "s1", checkpointIds: ["stand-louis"] })).toEqual(err(staffScopeError("unknown")));
    expect(unreadable.scopes.save).not.toHaveBeenCalled();

    const unsaved = setup({ saved: err({ code: "unknown" }) });
    expect(await setStaffScope(unsaved.deps, ADMIN, { uid: "s1", checkpointIds: ["stand-louis"] })).toEqual(err(staffScopeError("unknown")));
    expect(unsaved.audit.append).not.toHaveBeenCalled();
  });

  it("keeps a saved change when only the audit line fails", async () => {
    const t = setup({ audited: err({ code: "unknown" }) });

    expect(await setStaffScope(t.deps, ADMIN, { uid: "s1", checkpointIds: ["almuerzo"] })).toEqual(ok(["almuerzo"]));
  });
});

describe("listStaffScopes", () => {
  it("answers every limited staff member to an admin, and nothing to anyone else", async () => {
    const t = setup();

    expect(await listStaffScopes(t.deps, ADMIN)).toEqual(ok({ s1: ["stand-louis"] }));
    expect(await listStaffScopes(t.deps, { uid: "s1", role: "staff" })).toEqual(err(staffScopeError("forbidden")));
  });

  it("reports a failed read as unknown", async () => {
    const t = setup();
    t.scopes.list.mockResolvedValue(err({ code: "unknown" }) as never);

    expect(await listStaffScopes(t.deps, ADMIN)).toEqual(err(staffScopeError("unknown")));
  });
});
