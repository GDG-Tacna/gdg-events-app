import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import {
  SPEAKER_CODE_LIFETIME_SECONDS,
  SPEAKER_CODE_MAX_FUTURE_SECONDS,
  formatSpeakerPayload,
  isSpeakerCode,
  issueSpeakerCode,
  parseSpeakerPayload,
  speakerSigningInput,
  verifySpeakerCode,
  type SpeakerCodeDeps,
  type TokenSigner,
} from "./speaker-code";

const NOW = Date.UTC(2026, 9, 24, 15, 0, 0, 500);
const NOW_SECONDS = Math.floor(NOW / 1000);

const signer: TokenSigner = {
  sign: (input) => `sig_${input.replace(/[^A-Za-z0-9_-]/g, "-")}_xxxxxxxxxxxx`,
  verify(input, signature) {
    return signature === this.sign(input);
  },
};

type Found = { id: string; name: string; active: boolean; uid: string | null };
const ANA: Found = { id: "ana-torres", name: "Ana Torres", active: true, uid: "uid-ana-123456" };

function setup(speaker: Found | null = ANA, now = NOW) {
  const deps = {
    signer,
    encoder: { encode: vi.fn((text: string) => [text]) },
    speakers: { find: vi.fn(async (id: string): Promise<Result<Found | null, { code: string }>> => ok(speaker && speaker.id === id ? speaker : null)) },
    now: () => now,
  } satisfies SpeakerCodeDeps;
  return deps;
}

const codeFor = (id: string, expiresAt: number) => formatSpeakerPayload(id, expiresAt, signer.sign(speakerSigningInput(id, expiresAt)));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("issueSpeakerCode", () => {
  it("draws a signed code of the speaker for two minutes, for an admin", async () => {
    const deps = setup();

    const issued = await issueSpeakerCode(deps, { uid: "admin-1", role: "admin" }, { speakerId: "ana-torres" });

    const expiresAt = NOW_SECONDS + SPEAKER_CODE_LIFETIME_SECONDS;
    expect(issued).toEqual(ok({ speakerId: "ana-torres", name: "Ana Torres", cells: [codeFor("ana-torres", expiresAt)], issuedAt: NOW, expiresAt: expiresAt * 1000 }));
  });

  it("gives the speaker their own code, and nobody else's", async () => {
    const deps = setup();

    expect((await issueSpeakerCode(deps, { uid: "uid-ana-123456", role: "attendee" }, { speakerId: "ana-torres" })).ok).toBe(true);
    expect(await issueSpeakerCode(deps, { uid: "someone-else", role: "attendee" }, { speakerId: "ana-torres" })).toEqual(err({ code: "forbidden" }));
    expect(await issueSpeakerCode(setup({ ...ANA, uid: null }), { uid: "someone-else", role: null }, { speakerId: "ana-torres" })).toEqual(err({ code: "forbidden" }));
  });

  it("has no code for an unknown or inactive speaker", async () => {
    expect(await issueSpeakerCode(setup(), { uid: "admin-1", role: "admin" }, { speakerId: "zoe" })).toEqual(err({ code: "not-found" }));
    expect(await issueSpeakerCode(setup(), { uid: "admin-1", role: "admin" }, { speakerId: "Not An Id" })).toEqual(err({ code: "not-found" }));
    expect(await issueSpeakerCode(setup({ ...ANA, active: false }), { uid: "admin-1", role: "admin" }, { speakerId: "ana-torres" })).toEqual(err({ code: "inactive" }));
  });

  it("answers unknown when the catalog or the signing fails", async () => {
    const failing = setup();
    failing.speakers.find.mockResolvedValueOnce(err({ code: "x" }));
    expect(await issueSpeakerCode(failing, { uid: "admin-1", role: "admin" }, { speakerId: "ana-torres" })).toEqual(err({ code: "unknown" }));

    const noSecret = { ...setup(), signer: { sign: () => { throw new Error("no secret"); }, verify: () => false } };
    expect(await issueSpeakerCode(noSecret, { uid: "admin-1", role: "admin" }, { speakerId: "ana-torres" })).toEqual(err({ code: "unknown" }));
  });
});

describe("verifySpeakerCode", () => {
  const deps = { signer, now: () => NOW };

  it("accepts a genuine code until it ends", () => {
    expect(verifySpeakerCode(deps, codeFor("ana-torres", NOW_SECONDS + 10))).toEqual({ ok: true, speakerId: "ana-torres" });
    expect(verifySpeakerCode(deps, codeFor("ana-torres", NOW_SECONDS))).toEqual({ ok: true, speakerId: "ana-torres" });
  });

  it("tells a genuine but old code apart from a forged one", () => {
    expect(verifySpeakerCode(deps, codeFor("ana-torres", NOW_SECONDS - 1))).toEqual({ ok: false, code: "expired-code" });
    const forged = formatSpeakerPayload("luis", NOW_SECONDS + 10, signer.sign(speakerSigningInput("ana-torres", NOW_SECONDS + 10)));
    expect(verifySpeakerCode(deps, forged)).toEqual({ ok: false, code: "invalid-code" });
    expect(verifySpeakerCode(deps, codeFor("ana-torres", NOW_SECONDS + SPEAKER_CODE_MAX_FUTURE_SECONDS + 1))).toEqual({ ok: false, code: "invalid-code" });
  });

  it("never accepts another kind of code signed with the same secret", () => {
    // A talk code signs `<checkpoint>.<expiry>`: its signature does not fit a speaker's code with the same id.
    const talkSigned = formatSpeakerPayload("ana-torres", NOW_SECONDS + 10, signer.sign(`ana-torres.${NOW_SECONDS + 10}`));
    expect(verifySpeakerCode(deps, talkSigned)).toEqual({ ok: false, code: "invalid-code" });
    expect(verifySpeakerCode(deps, `devfest:eq:ana-torres.${NOW_SECONDS + 10}.${signer.sign(`ana-torres.${NOW_SECONDS + 10}`)}`)).toEqual({ ok: false, code: "invalid-code" });
  });

  it("recognizes its own prefix and refuses malformed codes", () => {
    expect(isSpeakerCode("devfest:sp:anything")).toBe(true);
    expect(isSpeakerCode("devfest:eq:talk.1.sig")).toBe(false);
    expect(parseSpeakerPayload("devfest:sp:ana-torres.123")).toBeNull();
    expect(parseSpeakerPayload("devfest:sp:Ana.123.sig_xxxxxxxxxxxxxxxx")).toBeNull();
    expect(parseSpeakerPayload("devfest:sp:ana-torres.12a.sig_xxxxxxxxxxxxxxxx")).toBeNull();
  });
});
