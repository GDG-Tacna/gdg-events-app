import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/ephemeral-qr.server", () => ({ ephemeralQrDeps: { marker: "deps" } }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const permissions = vi.hoisted(() => ({ mayEdit: vi.fn<(session: unknown, section: unknown) => Promise<boolean>>(async () => true), staffStations: vi.fn(async () => ["entrance", "catering"]), staffCheckpoints: vi.fn<(session: unknown) => Promise<readonly string[] | undefined>>(async () => undefined) }));
vi.mock("@/app-shell/permissions.server", () => permissions);

const qrServer = { issueQr: vi.fn() };
vi.mock("@/features/ephemeral-qr/server", () => qrServer);

const features = vi.hoisted(() => ({ FEATURES: { admin: true, checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { issueQrAction } = await import("./issue-qr.action");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });

describe("issueQrAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.checkins = true;
    guards.getSession.mockResolvedValue(session("admin"));
    permissions.mayEdit.mockResolvedValue(true);
    permissions.staffStations.mockResolvedValue(["entrance", "catering"]);
    permissions.staffCheckpoints.mockResolvedValue(undefined);
  });

  it("does nothing when check-ins are switched off, without reading the session", async () => {
    features.FEATURES.checkins = false;

    expect(await issueQrAction({ checkpointId: "talk-1" })).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
    expect(qrServer.issueQr).not.toHaveBeenCalled();
  });

  it("switches off the admin's screens with the admin area, but not the staff's", async () => {
    features.FEATURES.admin = false;
    expect(await issueQrAction({ checkpointId: "talk-1" })).toEqual({ ok: false, code: "disabled" });
    expect(qrServer.issueQr).not.toHaveBeenCalled();

    guards.getSession.mockResolvedValue(session("staff"));
    qrServer.issueQr.mockResolvedValue({ ok: false, error: { code: "forbidden" } });
    await issueQrAction({ checkpointId: "entrada-norte" });
    expect(qrServer.issueQr).toHaveBeenCalledTimes(1);
  });

  it("refuses an anonymous caller", async () => {
    guards.getSession.mockResolvedValue(null);

    expect(await issueQrAction({ checkpointId: "talk-1" })).toEqual({ ok: false, code: "unauthenticated" });
    expect(qrServer.issueQr).not.toHaveBeenCalled();
  });

  it.each(["attendee", null] as const)("refuses a %s session", async (role) => {
    guards.getSession.mockResolvedValue(session(role));

    expect(await issueQrAction({ checkpointId: "talk-1" })).toEqual({ ok: false, code: "forbidden" });
    expect(qrServer.issueQr).not.toHaveBeenCalled();
  });

  it("refuses an admin the edition keeps away from Puestos and Charlas, whatever their role", async () => {
    permissions.mayEdit.mockResolvedValue(false);

    expect(await issueQrAction({ checkpointId: "entrada-norte" })).toEqual({ ok: false, code: "forbidden" });
    expect(permissions.mayEdit).toHaveBeenCalledWith(session("admin"), ["checkpoints", "talks"]);
    expect(qrServer.issueQr).not.toHaveBeenCalled();
  });

  it("lets staff ask, handing the use case the kinds of station the edition lets them operate", async () => {
    guards.getSession.mockResolvedValue(session("staff"));
    qrServer.issueQr.mockResolvedValue({ ok: true, value: { checkpointId: "entrada-norte", name: "Entrada norte", payload: "devfest:eq:X", cells: ["1"], issuedAt: 1, expiresAt: 61_001 } });

    expect(await issueQrAction({ checkpointId: "entrada-norte" })).toMatchObject({ ok: true, qr: { checkpointId: "entrada-norte", expiresAt: 61_001 } });

    expect(qrServer.issueQr).toHaveBeenCalledWith({ marker: "deps" }, { uid: "a1", role: "staff", kinds: ["entrance", "catering"] }, { checkpointId: "entrada-norte" });
    expect(permissions.mayEdit).not.toHaveBeenCalled();
  });

  it("hands the use case the stations an admin limited the staff member to, read for the session", async () => {
    guards.getSession.mockResolvedValue(session("staff"));
    permissions.staffStations.mockResolvedValue(["stand"]);
    permissions.staffCheckpoints.mockResolvedValue(["stand-louis"]);
    qrServer.issueQr.mockResolvedValue({ ok: false, error: { code: "forbidden" } });

    expect(await issueQrAction({ checkpointId: "stand-cloud" })).toEqual({ ok: false, code: "forbidden" });
    expect(permissions.staffCheckpoints).toHaveBeenCalledWith(session("staff"));
    expect(qrServer.issueQr).toHaveBeenCalledWith({ marker: "deps" }, { uid: "a1", role: "staff", kinds: ["stand"], checkpointIds: ["stand-louis"] }, { checkpointId: "stand-cloud" });
  });

  it("never limits an admin by a staff scope", async () => {
    qrServer.issueQr.mockResolvedValue({ ok: false, error: { code: "forbidden" } });

    await issueQrAction({ checkpointId: "stand-cloud" });
    expect(permissions.staffCheckpoints).not.toHaveBeenCalled();
    expect(qrServer.issueQr).toHaveBeenCalledWith({ marker: "deps" }, { uid: "a1", role: "admin" }, { checkpointId: "stand-cloud" });
  });

  it.each(["", "x".repeat(49), undefined as unknown as string, 5 as unknown as string])(
    "rejects a checkpoint id that cannot exist (%j) without touching the use case",
    async (checkpointId) => {
      expect(await issueQrAction({ checkpointId })).toEqual({ ok: false, code: "checkpoint-not-found" });
      expect(qrServer.issueQr).not.toHaveBeenCalled();
    },
  );

  it("takes the actor from the session and returns the picture and timing, never the signed payload", async () => {
    qrServer.issueQr.mockResolvedValue({
      ok: true,
      value: {
        checkpointId: "talk-1",
        name: "Keynote",
        payload: "devfest:eq:SECRET-PAYLOAD",
        cells: ["101"],
        issuedAt: 1000,
        expiresAt: 121_000,
      },
    });

    const result = await issueQrAction({ checkpointId: "talk-1" });

    expect(qrServer.issueQr).toHaveBeenCalledWith({ marker: "deps" }, { uid: "a1", role: "admin" }, { checkpointId: "talk-1" });
    expect(result).toEqual({
      ok: true,
      qr: { checkpointId: "talk-1", name: "Keynote", cells: ["101"], issuedAt: 1000, expiresAt: 121_000 },
    });
    expect(JSON.stringify(result)).not.toContain("SECRET-PAYLOAD");
  });

  it("maps a use case failure to its code only", async () => {
    qrServer.issueQr.mockResolvedValue({ ok: false, error: { code: "not-shown-on-screen" } });

    expect(await issueQrAction({ checkpointId: "lunch-1" })).toEqual({ ok: false, code: "not-shown-on-screen" });
  });
});
