import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/ephemeral-qr.server", () => ({ ephemeralQrDeps: { marker: "deps" } }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

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
  });

  it.each([["admin"], ["checkins"]] as const)("does nothing when the %s feature is switched off", async (flag) => {
    features.FEATURES[flag] = false;

    expect(await issueQrAction({ checkpointId: "talk-1" })).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
    expect(qrServer.issueQr).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    guards.getSession.mockResolvedValue(null);

    expect(await issueQrAction({ checkpointId: "talk-1" })).toEqual({ ok: false, code: "unauthenticated" });
    expect(qrServer.issueQr).not.toHaveBeenCalled();
  });

  it.each(["attendee", "staff", null] as const)("refuses a %s session", async (role) => {
    guards.getSession.mockResolvedValue(session(role));

    expect(await issueQrAction({ checkpointId: "talk-1" })).toEqual({ ok: false, code: "forbidden" });
    expect(qrServer.issueQr).not.toHaveBeenCalled();
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
    qrServer.issueQr.mockResolvedValue({ ok: false, error: { code: "not-a-talk" } });

    expect(await issueQrAction({ checkpointId: "lunch-1" })).toEqual({ ok: false, code: "not-a-talk" });
  });
});
