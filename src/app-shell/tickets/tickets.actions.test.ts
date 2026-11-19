import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/tickets.server", () => ({ ticketDeps: { marker: "tickets" } }));
const serve = vi.hoisted(() => ({
  limiter: { consume: vi.fn() },
  passes: { verify: vi.fn() },
  attendees: { find: vi.fn() },
}));
vi.mock("@/app-shell/composition/checkpoints.server", () => ({ serveDeps: serve }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const permissions = vi.hoisted(() => ({
  mayEdit: vi.fn<(session: unknown, section: unknown) => Promise<boolean>>(async () => true),
  staffStations: vi.fn(async (): Promise<readonly string[]> => ["entrance", "catering", "stand"]),
  staffCheckpoints: vi.fn(async (): Promise<readonly string[] | undefined> => undefined),
}));
vi.mock("@/app-shell/permissions.server", () => permissions);

const server = vi.hoisted(() => ({ changeCadetTicket: vi.fn(), importTicketHolders: vi.fn(), HOLDERS_MAX_ROWS: 2000 }));
vi.mock("@/features/tickets/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true, checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const actions = await import("./tickets.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, adminScope: "edition", displayName: null, photoUrl: null });
const UID = "cadet-0001";

beforeEach(() => {
  vi.clearAllMocks();
  features.FEATURES.admin = true;
  features.FEATURES.checkins = true;
  guards.getSession.mockResolvedValue(session("admin"));
  permissions.mayEdit.mockResolvedValue(true);
  permissions.staffStations.mockResolvedValue(["entrance", "catering", "stand"]);
  permissions.staffCheckpoints.mockResolvedValue(undefined);
});

describe("changeCadetTicketAction", () => {
  beforeEach(() => {
    server.changeCadetTicket.mockResolvedValue({ ok: true, value: { before: "general" } });
  });

  it("needs a session", async () => {
    guards.getSession.mockResolvedValue(null);

    expect(await actions.changeCadetTicketAction({ uid: UID, type: "premium" })).toEqual({ ok: false, code: "unauthenticated" });
    expect(server.changeCadetTicket).not.toHaveBeenCalled();
  });

  it("lets an admin who may edit Cadetes change a ticket, as the actor of the session", async () => {
    expect(await actions.changeCadetTicketAction({ uid: UID, type: "premium" })).toEqual({ ok: true });

    expect(permissions.mayEdit).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), "cadets");
    expect(server.changeCadetTicket).toHaveBeenCalledWith({ marker: "tickets" }, { uid: "a1", role: "admin" }, { uid: UID, type: "premium" });
  });

  it("refuses an admin who may only look at Cadetes, and one with the admin switched off", async () => {
    permissions.mayEdit.mockResolvedValue(false);
    expect(await actions.changeCadetTicketAction({ uid: UID, type: "premium" })).toEqual({ ok: false, code: "forbidden" });

    permissions.mayEdit.mockResolvedValue(true);
    features.FEATURES.admin = false;
    expect(await actions.changeCadetTicketAction({ uid: UID, type: "premium" })).toEqual({ ok: false, code: "disabled" });
    expect(server.changeCadetTicket).not.toHaveBeenCalled();
  });

  it("lets staff who operate a station change a ticket", async () => {
    guards.getSession.mockResolvedValue(session("staff"));

    expect(await actions.changeCadetTicketAction({ uid: UID, type: "pro" })).toEqual({ ok: true });

    expect(server.changeCadetTicket).toHaveBeenCalledWith({ marker: "tickets" }, { uid: "a1", role: "staff" }, { uid: UID, type: "pro" });
  });

  it("refuses staff the edition gave no kind of station, or the organizer limited to none, and staff with check-ins off", async () => {
    guards.getSession.mockResolvedValue(session("staff"));

    permissions.staffStations.mockResolvedValue([]);
    expect(await actions.changeCadetTicketAction({ uid: UID, type: "pro" })).toEqual({ ok: false, code: "forbidden" });

    permissions.staffStations.mockResolvedValue(["stand"]);
    permissions.staffCheckpoints.mockResolvedValue([]);
    expect(await actions.changeCadetTicketAction({ uid: UID, type: "pro" })).toEqual({ ok: false, code: "forbidden" });

    permissions.staffCheckpoints.mockResolvedValue(["stand-1"]);
    features.FEATURES.checkins = false;
    expect(await actions.changeCadetTicketAction({ uid: UID, type: "pro" })).toEqual({ ok: false, code: "disabled" });
    expect(server.changeCadetTicket).not.toHaveBeenCalled();
  });

  it.each(["attendee", null] as const)("refuses a %s session", async (role) => {
    guards.getSession.mockResolvedValue(session(role));

    expect(await actions.changeCadetTicketAction({ uid: UID, type: "premium" })).toEqual({ ok: false, code: "forbidden" });
    expect(server.changeCadetTicket).not.toHaveBeenCalled();
  });

  it("refuses a ticket that does not exist before reaching the use case", async () => {
    expect(await actions.changeCadetTicketAction({ uid: UID, type: "vip" })).toEqual({ ok: false, code: "invalid-ticket" });
    expect(await actions.changeCadetTicketAction({ uid: "", type: "pro" })).toEqual({ ok: false, code: "invalid-ticket" });
    expect(server.changeCadetTicket).not.toHaveBeenCalled();
  });

  it("answers with the code of a use case failure", async () => {
    server.changeCadetTicket.mockResolvedValue({ ok: false, error: { code: "not-found" } });

    expect(await actions.changeCadetTicketAction({ uid: UID, type: "pro" })).toEqual({ ok: false, code: "not-found" });
  });
});

describe("lookupTicketAction", () => {
  beforeEach(() => {
    guards.getSession.mockResolvedValue(session("staff"));
    serve.limiter.consume.mockResolvedValue(true);
    serve.passes.verify.mockResolvedValue({ ok: true, value: { uid: UID } });
    serve.attendees.find.mockResolvedValue({ ok: true, value: { alias: "Nova_7", squadId: null, ticket: "pro" } });
  });

  it("answers who the genuine pass belongs to and their ticket", async () => {
    expect(await actions.lookupTicketAction({ payload: "devfest:at:abc" })).toEqual({ ok: true, uid: UID, alias: "Nova_7", ticket: "pro" });

    expect(serve.limiter.consume).toHaveBeenCalledWith("a1");
    expect(serve.passes.verify).toHaveBeenCalledWith("devfest:at:abc");
  });

  it("is for staff and admins only, and needs a session", async () => {
    guards.getSession.mockResolvedValue(session("attendee"));
    expect(await actions.lookupTicketAction({ payload: "devfest:at:abc" })).toEqual({ ok: false, code: "forbidden" });

    guards.getSession.mockResolvedValue(null);
    expect(await actions.lookupTicketAction({ payload: "devfest:at:abc" })).toEqual({ ok: false, code: "unauthenticated" });
    expect(serve.passes.verify).not.toHaveBeenCalled();
  });

  it("answers a bad or expired code, a cadet without a profile, and a scan that is too fast", async () => {
    expect(await actions.lookupTicketAction({ payload: "" })).toEqual({ ok: false, code: "invalid-code" });

    serve.passes.verify.mockResolvedValue({ ok: false, error: { code: "expired-code" } });
    expect(await actions.lookupTicketAction({ payload: "devfest:at:abc" })).toEqual({ ok: false, code: "expired-code" });

    serve.passes.verify.mockResolvedValue({ ok: true, value: { uid: UID } });
    serve.attendees.find.mockResolvedValue({ ok: true, value: null });
    expect(await actions.lookupTicketAction({ payload: "devfest:at:abc" })).toEqual({ ok: false, code: "attendee-not-found" });

    serve.attendees.find.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await actions.lookupTicketAction({ payload: "devfest:at:abc" })).toEqual({ ok: false, code: "unknown" });

    serve.limiter.consume.mockResolvedValue(false);
    expect(await actions.lookupTicketAction({ payload: "devfest:at:abc" })).toEqual({ ok: false, code: "rate-limited" });
  });
});

describe("importTicketHoldersAction", () => {
  const rows = [{ email: "ana@example.com", fullName: "Ana", type: "premium" }];
  const summary = { total: 1, counts: { general: 0, pro: 0, premium: 1 }, applied: 1, keptManual: 0, failed: 0 };

  beforeEach(() => {
    server.importTicketHolders.mockResolvedValue({ ok: true, value: summary });
  });

  it("imports the list as the admin of the session", async () => {
    expect(await actions.importTicketHoldersAction({ rows })).toEqual({ ok: true, ...summary });

    expect(server.importTicketHolders).toHaveBeenCalledWith({ marker: "tickets" }, { uid: "a1", role: "admin" }, rows);
  });

  it("is only for admins who may edit Cadetes, and needs a session and the admin switched on", async () => {
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await actions.importTicketHoldersAction({ rows })).toEqual({ ok: false, code: "forbidden" });

    guards.getSession.mockResolvedValue(session("admin"));
    permissions.mayEdit.mockResolvedValue(false);
    expect(await actions.importTicketHoldersAction({ rows })).toEqual({ ok: false, code: "forbidden" });

    guards.getSession.mockResolvedValue(null);
    expect(await actions.importTicketHoldersAction({ rows })).toEqual({ ok: false, code: "unauthenticated" });

    features.FEATURES.admin = false;
    expect(await actions.importTicketHoldersAction({ rows })).toEqual({ ok: false, code: "disabled" });
    expect(server.importTicketHolders).not.toHaveBeenCalled();
  });

  it("validates the shape again: no rows, an unknown ticket and too many rows never reach the use case", async () => {
    expect(await actions.importTicketHoldersAction({ rows: [] })).toEqual({ ok: false, code: "invalid-rows" });
    expect(await actions.importTicketHoldersAction({ rows: [{ email: "ana@example.com", fullName: "Ana", type: "vip" }] })).toEqual({ ok: false, code: "invalid-rows" });
    const many = Array.from({ length: 2001 }, (_, index) => ({ email: `p${index}@example.com`, fullName: "", type: "general" }));
    expect(await actions.importTicketHoldersAction({ rows: many })).toEqual({ ok: false, code: "too-many-rows" });
    expect(server.importTicketHolders).not.toHaveBeenCalled();
  });

  it("answers with the code of a use case failure", async () => {
    server.importTicketHolders.mockResolvedValue({ ok: false, error: { code: "invalid-rows" } });

    expect(await actions.importTicketHoldersAction({ rows })).toEqual({ ok: false, code: "invalid-rows" });
  });
});
