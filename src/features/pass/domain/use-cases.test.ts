import { beforeEach, describe, expect, it, vi } from "vitest";
import { err } from "@/shared/lib/result";
import { PASS_LIFETIME_SECONDS, PASS_MAX_FUTURE_SECONDS, formatPassPayload, parsePassPayload, passSigningInput } from "./pass-code";
import { passError } from "./pass-error";
import type { QrEncoder, TokenSigner } from "./ports";
import { issuePass, verifyPass, type PassDeps } from "./use-cases";

const NOW = Date.UTC(2026, 9, 20, 14, 0, 0, 500);
const NOW_SECONDS = Math.floor(NOW / 1000);
const UID = "kJ3x9QmZp0aBcD1eFgHiJkLmNoP2";

const signer: TokenSigner = {
  sign: (input) => `sig_${input.replace(/[^A-Za-z0-9_-]/g, "-")}_xxxxxxxxxxxx`,
  verify(input, signature) {
    return signature === this.sign(input);
  },
};

function setup(now = NOW) {
  const encoder: QrEncoder = { encode: vi.fn((text: string) => [`1${text.length}`]) };
  const deps: PassDeps = { signer, encoder, now: () => now };
  return { deps, encoder };
}

const passFor = (uid: string, expiresAt: number) => formatPassPayload(uid, expiresAt, signer.sign(passSigningInput(uid, expiresAt)));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("issuePass", () => {
  it("makes a signed pass for the attendee in the session that lasts a minute", () => {
    const t = setup();

    const result = issuePass(t.deps, { uid: UID, role: "attendee" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expiresAtSeconds = NOW_SECONDS + PASS_LIFETIME_SECONDS;
    expect(result.value).toMatchObject({ issuedAt: NOW, expiresAt: expiresAtSeconds * 1000 });
    const payload = passFor(UID, expiresAtSeconds);
    expect(t.encoder.encode).toHaveBeenCalledWith(payload);
    expect(parsePassPayload(payload)).toMatchObject({ uid: UID });
    expect(result.value.cells).toEqual([`1${payload.length}`]);
  });

  it("never returns the signed text, only the picture", () => {
    const result = issuePass(setup().deps, { uid: UID, role: "attendee" });

    expect(JSON.stringify(result)).not.toContain("devfest:at:");
  });

  it.each([
    [{ uid: "s1", role: "staff" }],
    [{ uid: "a1", role: "admin" }],
    [{ uid: "u2", role: null }],
  ] as const)("is only for attendees: %j is refused", (actor) => {
    const t = setup();

    expect(issuePass(t.deps, actor)).toEqual(err(passError("forbidden")));
    expect(t.encoder.encode).not.toHaveBeenCalled();
  });

  it("reports a missing signing secret as unknown and says so in the log", () => {
    const t = setup();
    t.deps.signer = {
      sign: () => {
        throw new Error("QR_SIGNING_SECRET is missing");
      },
      verify: () => false,
    };

    expect(issuePass(t.deps, { uid: UID, role: "attendee" })).toEqual(err(passError("unknown")));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("QR_SIGNING_SECRET is missing"));
  });
});

describe("verifyPass", () => {
  it("accepts a pass we signed while it is alive and says whose it is", () => {
    expect(verifyPass(setup().deps, passFor(UID, NOW_SECONDS + 30))).toEqual({ ok: true, uid: UID });
  });

  it("accepts it up to its last second and refuses it after", () => {
    const expiresAt = NOW_SECONDS + 10;

    expect(verifyPass(setup(expiresAt * 1000).deps, passFor(UID, expiresAt))).toMatchObject({ ok: true });
    expect(verifyPass(setup((expiresAt + 1) * 1000).deps, passFor(UID, expiresAt))).toEqual({ ok: false, code: "expired-code" });
  });

  it("tells a genuine late pass apart from a bad one", () => {
    expect(verifyPass(setup().deps, passFor(UID, NOW_SECONDS - 600))).toEqual({ ok: false, code: "expired-code" });
  });

  it("rejects a pass whose attendee or expiry was altered as invalid, never as expired", () => {
    const { deps } = setup();
    const parsed = parsePassPayload(passFor(UID, NOW_SECONDS + 30))!;

    const someoneElse = formatPassPayload("anotherUid987654", parsed.expiresAt, parsed.signature);
    const longerLife = formatPassPayload(UID, parsed.expiresAt + 3600, parsed.signature);
    const expiredAndAltered = formatPassPayload(UID, NOW_SECONDS - 5, parsed.signature);

    for (const forged of [someoneElse, longerLife, expiredAndAltered]) {
      expect(verifyPass(deps, forged)).toEqual({ ok: false, code: "invalid-code" });
    }
  });

  it("refuses a signed pass that claims to live longer than a fresh one could", () => {
    const { deps } = setup();

    expect(verifyPass(deps, passFor(UID, NOW_SECONDS + PASS_MAX_FUTURE_SECONDS + 1))).toEqual({ ok: false, code: "invalid-code" });
    expect(verifyPass(deps, passFor(UID, NOW_SECONDS + PASS_MAX_FUTURE_SECONDS))).toMatchObject({ ok: true });
  });

  it.each(["", "devfest:cp:entrance-main", "devfest:eq:talk-1.100.abcdefghijklmnopqrstuvwxyz", "garbage"])(
    "treats %j as invalid",
    (payload) => {
      expect(verifyPass(setup().deps, payload)).toEqual({ ok: false, code: "invalid-code" });
    },
  );

  it("treats a signer failure as invalid and logs it, never as accepted", () => {
    const { deps } = setup();
    deps.signer = {
      sign: () => "x",
      verify: () => {
        throw new Error("QR_SIGNING_SECRET is missing");
      },
    };

    expect(verifyPass(deps, passFor(UID, NOW_SECONDS + 30))).toEqual({ ok: false, code: "invalid-code" });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("pass.verify"));
  });
});
