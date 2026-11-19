import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/attendee.server", () => ({ attendeeDeps: { marker: "deps" } }));
const speakers = vi.hoisted(() => ({ linkedSpeaker: vi.fn(async (): Promise<{ id: string; name: string } | null> => null) }));
vi.mock("@/app-shell/speakers/linked-speaker.server", () => speakers);
const modules = vi.hoisted(() => ({ moduleOn: vi.fn(async () => true) }));
vi.mock("@/app-shell/modules.server", () => modules);

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const attendeeServer = { registerAttendee: vi.fn() };
vi.mock("@/features/attendee/server", () => attendeeServer);
vi.mock("@/app-shell/composition/tickets.server", () => ({ ticketHolders: { marker: "holders" } }));
const ticketsServer = vi.hoisted(() => ({ resolveTicketFor: vi.fn(async (): Promise<{ type: string; source: string }> => ({ type: "general", source: "default" })) }));
vi.mock("@/features/tickets/server", () => ticketsServer);

const { registerAttendeeAction } = await import("./register-attendee.action");

const session = (role: "attendee" | "staff" | "admin" | null, verifiedEmail: string | null = "ada@example.com") => ({ uid: "u1", role, displayName: "Ada", photoUrl: null, verifiedEmail });

describe("registerAttendeeAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("refuses an anonymous caller before running any rule", async () => {
    guards.getSession.mockResolvedValue(null);

    expect(await registerAttendeeAction({ alias: "Nova_7" })).toEqual({ ok: false, code: "unauthenticated" });
    expect(attendeeServer.registerAttendee).not.toHaveBeenCalled();
  });

  it.each(["staff", "admin"] as const)("does not onboard %s accounts as attendees", async (role) => {
    guards.getSession.mockResolvedValue(session(role));

    expect(await registerAttendeeAction({ alias: "Nova_7" })).toEqual({ ok: false, code: "forbidden" });
    expect(attendeeServer.registerAttendee).not.toHaveBeenCalled();
  });

  it("never makes a speaker a cadet where speakers may not play, and does where they may", async () => {
    guards.getSession.mockResolvedValue(session(null));
    speakers.linkedSpeaker.mockResolvedValue({ id: "ana-torres", name: "Ana Torres" });
    attendeeServer.registerAttendee.mockResolvedValue({ ok: true, value: { created: true } });

    modules.moduleOn.mockResolvedValueOnce(false);
    expect(await registerAttendeeAction({ alias: "Nova_7" })).toEqual({ ok: false, code: "forbidden" });
    expect(attendeeServer.registerAttendee).not.toHaveBeenCalled();

    modules.moduleOn.mockResolvedValueOnce(true);
    expect(await registerAttendeeAction({ alias: "Nova_7" })).toEqual({ ok: true, created: true });
    expect(modules.moduleOn).toHaveBeenCalledWith("speakerPlay");
  });

  it("registers with the uid of the verified session, never one from the client", async () => {
    guards.getSession.mockResolvedValue(session(null));
    attendeeServer.registerAttendee.mockResolvedValue({ ok: true, value: { created: true, attendee: {} } });

    const result = await registerAttendeeAction({ alias: "Nova_7", uid: "someone-else" } as never);

    expect(result).toEqual({ ok: true, created: true });
    expect(attendeeServer.registerAttendee).toHaveBeenCalledWith(expect.anything(), { uid: "u1", rawAlias: "Nova_7", ticket: { type: "general", source: "default" } });
  });

  it("registers with the ticket the list gives the email they signed in with", async () => {
    guards.getSession.mockResolvedValue(session(null, "ana@example.com"));
    ticketsServer.resolveTicketFor.mockResolvedValue({ type: "premium", source: "list" });
    attendeeServer.registerAttendee.mockResolvedValue({ ok: true, value: { created: true, attendee: {} } });

    expect(await registerAttendeeAction({ alias: "Nova_7" })).toEqual({ ok: true, created: true });

    expect(ticketsServer.resolveTicketFor).toHaveBeenCalledWith({ holders: { marker: "holders" } }, "ana@example.com");
    expect(attendeeServer.registerAttendee).toHaveBeenCalledWith(expect.anything(), { uid: "u1", rawAlias: "Nova_7", ticket: { type: "premium", source: "list" } });
  });

  it("registers with the default ticket when the email is not on the list or there is no verified email", async () => {
    guards.getSession.mockResolvedValue(session(null, null));
    attendeeServer.registerAttendee.mockResolvedValue({ ok: true, value: { created: true, attendee: {} } });

    await registerAttendeeAction({ alias: "Nova_7" });

    expect(ticketsServer.resolveTicketFor).toHaveBeenCalledWith(expect.anything(), null);
    expect(attendeeServer.registerAttendee).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ticket: { type: "general", source: "default" } }));
  });

  it("lets an already registered attendee retry safely", async () => {
    guards.getSession.mockResolvedValue(session("attendee"));
    attendeeServer.registerAttendee.mockResolvedValue({ ok: true, value: { created: false, attendee: {} } });

    expect(await registerAttendeeAction({ alias: "Nova_7" })).toEqual({ ok: true, created: false });
  });

  it("rejects an oversized alias without reaching the use case", async () => {
    guards.getSession.mockResolvedValue(session(null));

    expect(await registerAttendeeAction({ alias: "x".repeat(65) })).toEqual({
      ok: false,
      code: "alias-invalid",
      alias: "too-long",
    });
    expect(attendeeServer.registerAttendee).not.toHaveBeenCalled();
  });

  it("passes the failure code and the broken alias rule back to the form", async () => {
    guards.getSession.mockResolvedValue(session(null));
    attendeeServer.registerAttendee.mockResolvedValue({ ok: false, error: { code: "alias-invalid", alias: "reserved" } });

    expect(await registerAttendeeAction({ alias: "admin" })).toEqual({ ok: false, code: "alias-invalid", alias: "reserved" });
  });

  it("reports a taken alias", async () => {
    guards.getSession.mockResolvedValue(session(null));
    attendeeServer.registerAttendee.mockResolvedValue({ ok: false, error: { code: "alias-taken" } });

    expect(await registerAttendeeAction({ alias: "Nova_7" })).toMatchObject({ ok: false, code: "alias-taken" });
  });
});
