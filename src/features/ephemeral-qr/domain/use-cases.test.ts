import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import type { QrEncoder, TalkLookup, TokenSigner } from "./ports";
import { QR_LIFETIME_SECONDS, QR_MAX_FUTURE_SECONDS, formatPayload, parsePayload, signingInput } from "./qr-code";
import { qrError } from "./qr-error";
import { issueQr, listTalks, verifyPayload, type EphemeralQrDeps, type QrActor } from "./use-cases";

const ADMIN: QrActor = { uid: "a1", role: "admin" };
const NOW = Date.UTC(2026, 9, 20, 14, 0, 0, 500); // 14:00:00.500
const NOW_SECONDS = Math.floor(NOW / 1000);
const TALK = { id: "talk-keynote", kind: "talk", name: "Keynote", active: true };

/** A signer that is easy to reason about: the "signature" is the reversed input, padded to look like one. */
const signer: TokenSigner = {
  sign: (input) => `sig_${[...input].reverse().join("").replace(/[^A-Za-z0-9_-]/g, "-")}_xxxxxxxxxxxx`,
  verify(input, signature) {
    return signature === this.sign(input);
  },
};

interface Setup {
  found?: Result<typeof TALK | null, { code: string }>;
  active?: Result<readonly (typeof TALK)[], { code: string }>;
  now?: number;
}

function setup({ found = ok(TALK), active = ok([TALK]), now = NOW }: Setup = {}) {
  const lookup: TalkLookup = { find: vi.fn(async () => found), listActive: vi.fn(async () => active) };
  const encoder: QrEncoder = { encode: vi.fn((text: string) => [`1${text.length}`]) };
  const deps: EphemeralQrDeps = { signer, encoder, lookup, now: () => now };
  return { deps, lookup, encoder };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("issueQr", () => {
  it("issues a signed code for an active talk that works for two minutes", async () => {
    const t = setup();

    const result = await issueQr(t.deps, ADMIN, { checkpointId: "talk-keynote" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expiresAtSeconds = NOW_SECONDS + QR_LIFETIME_SECONDS;
    expect(result.value).toMatchObject({
      checkpointId: "talk-keynote",
      name: "Keynote",
      issuedAt: NOW,
      expiresAt: expiresAtSeconds * 1000,
    });
    expect(parsePayload(result.value.payload)).toMatchObject({ checkpointId: "talk-keynote", expiresAt: expiresAtSeconds });
    expect(result.value.payload).toBe(
      formatPayload("talk-keynote", expiresAtSeconds, signer.sign(signingInput("talk-keynote", expiresAtSeconds))),
    );
    expect(t.encoder.encode).toHaveBeenCalledWith(result.value.payload);
    expect(result.value.cells).toEqual([`1${result.value.payload.length}`]);
  });

  it.each([
    [{ uid: "s1", role: "staff" }],
    [{ uid: "u1", role: "attendee" }],
    [{ uid: "u2", role: null }],
  ] as const)("refuses %j before touching the catalog", async (actor) => {
    const t = setup();

    expect(await issueQr(t.deps, actor, { checkpointId: "talk-keynote" })).toEqual(err(qrError("forbidden")));
    expect(t.lookup.find).not.toHaveBeenCalled();
  });

  it("says so when the checkpoint does not exist", async () => {
    const t = setup({ found: ok(null) });

    expect(await issueQr(t.deps, ADMIN, { checkpointId: "nope-1" })).toEqual(err(qrError("checkpoint-not-found")));
  });

  it("does not issue codes for an inactive talk", async () => {
    const t = setup({ found: ok({ ...TALK, active: false }) });

    expect(await issueQr(t.deps, ADMIN, { checkpointId: "talk-keynote" })).toEqual(err(qrError("checkpoint-inactive")));
    expect(t.encoder.encode).not.toHaveBeenCalled();
  });

  it.each(["catering", "entrance"])("only talks use ephemeral codes: %s is refused", async (kind) => {
    const t = setup({ found: ok({ ...TALK, kind }) });

    expect(await issueQr(t.deps, ADMIN, { checkpointId: "talk-keynote" })).toEqual(err(qrError("not-a-talk")));
  });

  it("reports a catalog failure as unknown", async () => {
    const t = setup({ found: err({ code: "unknown" }) });

    expect(await issueQr(t.deps, ADMIN, { checkpointId: "talk-keynote" })).toEqual(err(qrError("unknown")));
  });

  it("reports a missing signing secret as unknown and says so in the log", async () => {
    const t = setup();
    t.deps.signer = {
      sign: () => {
        throw new Error("QR_SIGNING_SECRET is missing");
      },
      verify: () => false,
    };

    expect(await issueQr(t.deps, ADMIN, { checkpointId: "talk-keynote" })).toEqual(err(qrError("unknown")));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("QR_SIGNING_SECRET is missing"));
  });
});

describe("listTalks", () => {
  it("offers the active talks only, to an admin", async () => {
    const t = setup({
      active: ok([TALK, { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true }]),
    });

    expect(await listTalks(t.deps, ADMIN)).toEqual(ok([{ id: "talk-keynote", name: "Keynote" }]));
  });

  it("does not list anything for anyone else", async () => {
    const t = setup();

    expect(await listTalks(t.deps, { uid: "s1", role: "staff" })).toEqual(err(qrError("forbidden")));
    expect(t.lookup.listActive).not.toHaveBeenCalled();
  });

  it("reports a catalog failure as unknown", async () => {
    const t = setup({ active: err({ code: "unknown" }) });

    expect(await listTalks(t.deps, ADMIN)).toEqual(err(qrError("unknown")));
  });
});

describe("verifyPayload", () => {
  const payloadFor = (checkpointId: string, expiresAt: number) =>
    formatPayload(checkpointId, expiresAt, signer.sign(signingInput(checkpointId, expiresAt)));

  it("accepts a code we signed while it is alive", () => {
    const { deps } = setup();

    expect(verifyPayload(deps, payloadFor("talk-keynote", NOW_SECONDS + 60))).toEqual({
      ok: true,
      checkpointId: "talk-keynote",
    });
  });

  it("accepts it right up to its last second and refuses it after", () => {
    const expiresAt = NOW_SECONDS + 10;

    expect(verifyPayload(setup({ now: expiresAt * 1000 }).deps, payloadFor("talk-keynote", expiresAt))).toMatchObject({ ok: true });
    expect(verifyPayload(setup({ now: (expiresAt + 1) * 1000 }).deps, payloadFor("talk-keynote", expiresAt))).toEqual({
      ok: false,
      code: "expired-code",
    });
  });

  it("tells a genuine late code apart from a bad one, so the attendee knows to scan the current code", () => {
    const { deps } = setup();

    expect(verifyPayload(deps, payloadFor("talk-keynote", NOW_SECONDS - 600))).toEqual({ ok: false, code: "expired-code" });
  });

  it("rejects an altered checkpoint or expiry as invalid, never as expired", () => {
    const { deps } = setup();
    const genuine = payloadFor("talk-keynote", NOW_SECONDS + 60);
    const parsed = parsePayload(genuine)!;

    const otherTalk = formatPayload("talk-secret", parsed.expiresAt, parsed.signature);
    const longerLife = formatPayload("talk-keynote", parsed.expiresAt + 3600, parsed.signature);
    const expiredAndAltered = formatPayload("talk-keynote", NOW_SECONDS - 5, parsed.signature);

    for (const forged of [otherTalk, longerLife, expiredAndAltered]) {
      expect(verifyPayload(deps, forged)).toEqual({ ok: false, code: "invalid-code" });
    }
  });

  it("refuses a signed code that claims to live longer than a fresh one could (a leaked secret cannot mint long-lived codes)", () => {
    const { deps } = setup();
    const tooFar = NOW_SECONDS + QR_MAX_FUTURE_SECONDS + 1;

    expect(verifyPayload(deps, payloadFor("talk-keynote", tooFar))).toEqual({ ok: false, code: "invalid-code" });
    expect(verifyPayload(deps, payloadFor("talk-keynote", NOW_SECONDS + QR_MAX_FUTURE_SECONDS))).toMatchObject({ ok: true });
  });

  it.each(["", "devfest:cp:talk-keynote", "garbage"])("treats %j as invalid", (payload) => {
    expect(verifyPayload(setup().deps, payload)).toEqual({ ok: false, code: "invalid-code" });
  });

  it("treats a signer failure (missing secret) as invalid and logs it, never as accepted", () => {
    const { deps } = setup();
    deps.signer = {
      sign: () => "x",
      verify: () => {
        throw new Error("QR_SIGNING_SECRET is missing");
      },
    };

    expect(verifyPayload(deps, payloadFor("talk-keynote", NOW_SECONDS + 60))).toEqual({ ok: false, code: "invalid-code" });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("ephemeral-qr.verify"));
  });
});
