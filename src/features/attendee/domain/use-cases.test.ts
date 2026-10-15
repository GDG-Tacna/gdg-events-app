import { describe, expect, it, vi } from "vitest";
import type { Analytics } from "@/shared/lib/analytics/analytics";
import { err, ok } from "@/shared/lib/result";
import { createNewAttendee, type Attendee } from "./attendee";
import { createAlias } from "./alias";
import { attendeeError } from "./attendee-error";
import type { AttendeeRepository, RoleGranter } from "./ports";
import { getAttendee, registerAttendee, type RegisterAttendeeDeps } from "./use-cases";

const NOW = new Date("2026-10-04T12:00:00Z");

function deps(overrides: Partial<RegisterAttendeeDeps> = {}) {
  const attendees: AttendeeRepository = {
    findByUid: vi.fn(async () => ok(null)),
    register: vi.fn(async () => ok({ kind: "created" as const })),
  };
  const roles: RoleGranter = { grantAttendeeRole: vi.fn(async () => ok(undefined)) };
  const analytics: Analytics = { track: vi.fn() };
  const all: RegisterAttendeeDeps = { attendees, roles, analytics, now: () => NOW, ...overrides };
  return { all, attendees: all.attendees, roles: all.roles, analytics: all.analytics };
}

describe("registerAttendee", () => {
  it("creates the attendee with safe defaults, grants the role and counts the registration", async () => {
    const d = deps();

    const result = await registerAttendee(d.all, { uid: "u1", rawAlias: " Nova_7 " });

    expect(result).toEqual({
      ok: true,
      value: {
        created: true,
        attendee: {
          uid: "u1",
          alias: "Nova_7",
          role: "attendee",
          squad: null,
          xp: 0,
          credits: 0,
          createdAt: NOW,
        },
      },
    });
    expect(d.roles.grantAttendeeRole).toHaveBeenCalledWith("u1");
    expect(d.analytics.track).toHaveBeenCalledWith({ name: "attendee_registered", uid: "u1" });
  });

  it("stores the alias key used for uniqueness", async () => {
    const d = deps();

    await registerAttendee(d.all, { uid: "u1", rawAlias: "Nova_7" });

    expect(d.attendees.register).toHaveBeenCalledWith(expect.objectContaining({ uid: "u1" }), {
      display: "Nova_7",
      key: "nova_7",
    });
  });

  it("rejects an invalid alias before touching storage or roles", async () => {
    const d = deps();

    const result = await registerAttendee(d.all, { uid: "u1", rawAlias: "x" });

    expect(result).toEqual(err(attendeeError("alias-invalid", "too-short")));
    expect(d.attendees.register).not.toHaveBeenCalled();
    expect(d.roles.grantAttendeeRole).not.toHaveBeenCalled();
    expect(d.analytics.track).not.toHaveBeenCalled();
  });

  it("reports a taken alias without granting a role or counting a registration", async () => {
    const d = deps({
      attendees: {
        findByUid: vi.fn(async () => ok(null)),
        register: vi.fn(async () => err(attendeeError("alias-taken"))),
      },
    });

    const result = await registerAttendee(d.all, { uid: "u1", rawAlias: "Nova_7" });

    expect(result).toEqual(err(attendeeError("alias-taken")));
    expect(d.roles.grantAttendeeRole).not.toHaveBeenCalled();
    expect(d.analytics.track).not.toHaveBeenCalled();
  });

  it("on a retry keeps the stored attendee, re-applies the role grant and does not count it again", async () => {
    const stored: Attendee = createNewAttendee({
      uid: "u1",
      alias: { display: "Original", key: "original" },
      now: new Date("2026-10-01T00:00:00Z"),
    });
    const d = deps({
      attendees: {
        findByUid: vi.fn(async () => ok(stored)),
        register: vi.fn(async () => ok({ kind: "already-registered" as const, attendee: stored })),
      },
    });

    const result = await registerAttendee(d.all, { uid: "u1", rawAlias: "Another" });

    expect(result).toEqual(ok({ attendee: stored, created: false }));
    expect(d.roles.grantAttendeeRole).toHaveBeenCalledWith("u1");
    expect(d.analytics.track).not.toHaveBeenCalled();
  });

  it("still counts the registration when the role grant fails, and surfaces the failure", async () => {
    const d = deps({ roles: { grantAttendeeRole: vi.fn(async () => err(attendeeError("unknown"))) } });

    const result = await registerAttendee(d.all, { uid: "u1", rawAlias: "Nova_7" });

    expect(result).toEqual(err(attendeeError("unknown")));
    expect(d.analytics.track).toHaveBeenCalledOnce();
  });

  it("surfaces a storage failure without granting a role", async () => {
    const d = deps({
      attendees: {
        findByUid: vi.fn(async () => ok(null)),
        register: vi.fn(async () => err(attendeeError("unknown"))),
      },
    });

    expect(await registerAttendee(d.all, { uid: "u1", rawAlias: "Nova_7" })).toEqual(err(attendeeError("unknown")));
    expect(d.roles.grantAttendeeRole).not.toHaveBeenCalled();
  });
});

describe("createNewAttendee", () => {
  it("never starts with XP, credits or a squad", () => {
    const alias = createAlias("Orion");
    if (!alias.ok) throw new Error("fixture alias must be valid");

    const attendee = createNewAttendee({ uid: "u2", alias: alias.value, now: NOW });

    expect(attendee).toMatchObject({ role: "attendee", xp: 0, credits: 0, squad: null });
  });
});

describe("getAttendee", () => {
  it("returns null while onboarding is pending", async () => {
    expect(await getAttendee({ attendees: deps().attendees }, "u1")).toEqual(ok(null));
  });
});
