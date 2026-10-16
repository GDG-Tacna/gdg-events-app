import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/speakers.server", () => ({ speakerCodeDeps: { marker: "codes" } }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = vi.hoisted(() => ({ issueSpeakerCode: vi.fn() }));
vi.mock("@/features/speakers/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { issueSpeakerCodeAction } = await import("./code.action");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "u1", role, displayName: null, photoUrl: null });
const ISSUED = { speakerId: "ana-torres", name: "Ana Torres", cells: ["101"], issuedAt: 1, expiresAt: 2 };

describe("issueSpeakerCodeAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.checkins = true;
    guards.getSession.mockResolvedValue(session("admin"));
    server.issueSpeakerCode.mockResolvedValue({ ok: true, value: ISSUED });
  });

  it("answers the picture and timing for the session's actor, never the signed text", async () => {
    expect(await issueSpeakerCodeAction({ speakerId: "ana-torres" })).toEqual({ ok: true, qr: { checkpointId: "ana-torres", name: "Ana Torres", cells: ["101"], issuedAt: 1, expiresAt: 2 } });
    expect(server.issueSpeakerCode).toHaveBeenCalledWith({ marker: "codes" }, { uid: "u1", role: "admin" }, { speakerId: "ana-torres" });

    // Anyone else is passed on: the use case only gives them the code of the speaker linked to their account.
    guards.getSession.mockResolvedValue(session("attendee"));
    await issueSpeakerCodeAction({ speakerId: "ana-torres" });
    expect(server.issueSpeakerCode).toHaveBeenLastCalledWith({ marker: "codes" }, { uid: "u1", role: "attendee" }, { speakerId: "ana-torres" });
  });

  it("says the screen's words for a refusal", async () => {
    server.issueSpeakerCode.mockResolvedValueOnce({ ok: false, error: { code: "inactive" } });
    expect(await issueSpeakerCodeAction({ speakerId: "ana-torres" })).toEqual({ ok: false, code: "checkpoint-inactive" });

    server.issueSpeakerCode.mockResolvedValueOnce({ ok: false, error: { code: "not-found" } });
    expect(await issueSpeakerCodeAction({ speakerId: "ana-torres" })).toEqual({ ok: false, code: "checkpoint-not-found" });
  });

  it("refuses when switched off, without a session, or with input of the wrong shape", async () => {
    features.FEATURES.checkins = false;
    expect(await issueSpeakerCodeAction({ speakerId: "ana-torres" })).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.checkins = true;

    guards.getSession.mockResolvedValue(null);
    expect(await issueSpeakerCodeAction({ speakerId: "ana-torres" })).toEqual({ ok: false, code: "unauthenticated" });

    guards.getSession.mockResolvedValue(session("admin"));
    expect(await issueSpeakerCodeAction({ speakerId: "x".repeat(49) })).toEqual({ ok: false, code: "checkpoint-not-found" });
    expect(server.issueSpeakerCode).not.toHaveBeenCalled();
  });
});
