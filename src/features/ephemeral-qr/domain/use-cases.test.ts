import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import type { QrEncoder, TalkLookup, TokenSigner } from "./ports";
import { ENTRANCE_QR_LIFETIME_SECONDS, QR_LIFETIME_SECONDS, QR_MAX_FUTURE_SECONDS, formatPayload, parsePayload, signingInput } from "./qr-code";
import { qrError } from "./qr-error";
import { issueQr, listScreenCheckpoints, listTalks, verifyPayload, type EphemeralQrDeps, type QrActor } from "./use-cases";

const ADMIN: QrActor = { uid: "a1", role: "admin" };
const NOW = Date.UTC(2026, 9, 20, 14, 0, 0, 500); // 14:00:00.500
const NOW_SECONDS = Math.floor(NOW / 1000);
const TALK = { id: "talk-keynote", kind: "talk", name: "Keynote", active: true };
const DOOR = { id: "entrada-norte", kind: "entrance", name: "Entrada norte", active: true };
const STAND = { id: "stand-louis", kind: "stand", name: "Stand Louis 3D", active: true };
const OTHER_STAND = { id: "stand-cloud", kind: "stand", name: "Stand Cloud", active: true };
const STAFF: QrActor = { uid: "s1", role: "staff", kinds: ["entrance", "catering", "stand"] };

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

describe("listScreenCheckpoints", () => {
  it("lists every open talk, entrance and stand for an admin, with its kind, but never a meal", async () => {
    const t = setup({ active: ok([TALK, DOOR, { id: "almuerzo", kind: "catering", name: "Almuerzo", active: true }, { id: "stand-ai", kind: "stand", name: "AI", active: true }]) });

    expect(await listScreenCheckpoints(t.deps, ADMIN)).toEqual(
      ok([
        { id: "talk-keynote", name: "Keynote", kind: "talk", description: "", image: null },
        { id: "entrada-norte", name: "Entrada norte", kind: "entrance", description: "", image: null },
        { id: "stand-ai", name: "AI", kind: "stand", description: "", image: null },
      ]),
    );
  });

  it("lists only the entrances and stands staff may operate, and nothing for staff who may not", async () => {
    const t = setup({ active: ok([TALK, DOOR, STAND]) });

    expect(await listScreenCheckpoints(t.deps, STAFF)).toEqual(ok([{ id: "entrada-norte", name: "Entrada norte", kind: "entrance", description: "", image: null }, { id: "stand-louis", name: "Stand Louis 3D", kind: "stand", description: "", image: null }]));
    expect(await listScreenCheckpoints(t.deps, { ...STAFF, kinds: ["stand"] })).toEqual(ok([{ id: "stand-louis", name: "Stand Louis 3D", kind: "stand", description: "", image: null }]));
    expect(await listScreenCheckpoints(t.deps, { ...STAFF, kinds: ["catering"] })).toEqual(ok([]));
  });

  it("carries a puesto's description and image address, for its screen", async () => {
    const t = setup({ active: ok([{ ...STAND, description: "Impresión 3D", image: "/media/logo.webp" }]) });

    expect(await listScreenCheckpoints(t.deps, ADMIN)).toMatchObject({ ok: true, value: [{ id: "stand-louis", description: "Impresión 3D", image: "/media/logo.webp" }] });
  });

  it("lists only their own stations for staff an admin limited, and never limits an admin", async () => {
    const t = setup({ active: ok([TALK, DOOR, STAND, OTHER_STAND]) });

    expect(await listScreenCheckpoints(t.deps, { ...STAFF, checkpointIds: ["stand-louis"] })).toEqual(ok([{ id: "stand-louis", name: "Stand Louis 3D", kind: "stand", description: "", image: null }]));
    expect(await listScreenCheckpoints(t.deps, { ...STAFF, checkpointIds: [] })).toEqual(ok([]));
    const admin = await listScreenCheckpoints(t.deps, { ...ADMIN, checkpointIds: ["stand-louis"] });
    expect(admin.ok && admin.value.map((point) => point.id)).toEqual(["talk-keynote", "entrada-norte", "stand-louis", "stand-cloud"]);
  });

  it("refuses attendees and reports a failed read", async () => {
    expect(await listScreenCheckpoints(setup().deps, { uid: "u1", role: "attendee" })).toEqual(err(qrError("forbidden")));
    expect(await listScreenCheckpoints(setup({ active: err({ code: "x" }) }).deps, ADMIN)).toEqual(err(qrError("unknown")));
  });
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

  it("only talks, entrances and stands show a code on a screen: a meal is refused", async () => {
    const t = setup({ found: ok({ ...TALK, kind: "catering" }) });

    expect(await issueQr(t.deps, ADMIN, { checkpointId: "talk-keynote" })).toEqual(err(qrError("not-shown-on-screen")));
  });

  it("issues a stand's code for a minute, like the entrance's, and the verifier accepts it", async () => {
    const t = setup({ found: ok(STAND) });

    const result = await issueQr(t.deps, ADMIN, { checkpointId: "stand-louis" });

    expect(result.ok && result.value).toMatchObject({ checkpointId: "stand-louis", name: "Stand Louis 3D", issuedAt: NOW, expiresAt: (NOW_SECONDS + ENTRANCE_QR_LIFETIME_SECONDS) * 1000 });
    expect(verifyPayload({ signer, now: () => NOW }, result.ok ? result.value.payload : "")).toEqual({ ok: true, checkpointId: "stand-louis" });
  });

  it("issues the entrance's code for a minute, half of a talk's, and the verifier accepts it", async () => {
    const t = setup({ found: ok(DOOR) });

    const result = await issueQr(t.deps, ADMIN, { checkpointId: "entrada-norte" });

    expect(result.ok && result.value).toMatchObject({ checkpointId: "entrada-norte", name: "Entrada norte", issuedAt: NOW, expiresAt: (NOW_SECONDS + ENTRANCE_QR_LIFETIME_SECONDS) * 1000 });
    expect(ENTRANCE_QR_LIFETIME_SECONDS).toBe(60);
    expect(ENTRANCE_QR_LIFETIME_SECONDS).toBeLessThan(QR_LIFETIME_SECONDS);
    expect(verifyPayload({ signer, now: () => NOW }, result.ok ? result.value.payload : "")).toEqual({ ok: true, checkpointId: "entrada-norte" });
  });

  describe("staff", () => {
    it("show the entrance's code when the edition lets staff operate entrances", async () => {
      const t = setup({ found: ok(DOOR) });

      expect(await issueQr(t.deps, STAFF, { checkpointId: "entrada-norte" })).toMatchObject({ ok: true });
    });

    it("do not show it when the edition keeps them off entrances", async () => {
      const t = setup({ found: ok(DOOR) });

      expect(await issueQr(t.deps, { ...STAFF, kinds: ["catering", "stand"] }, { checkpointId: "entrada-norte" })).toEqual(err(qrError("forbidden")));
      expect(await issueQr(t.deps, { uid: "s2", role: "staff" }, { checkpointId: "entrada-norte" })).toEqual(err(qrError("forbidden")));
      expect(t.encoder.encode).not.toHaveBeenCalled();
    });

    it("never show a talk's code, whatever they may operate", async () => {
      const t = setup();

      expect(await issueQr(t.deps, STAFF, { checkpointId: "talk-keynote" })).toEqual(err(qrError("forbidden")));
      expect(t.encoder.encode).not.toHaveBeenCalled();
    });

    it("show a stand's code when the edition lets staff operate stands", async () => {
      const t = setup({ found: ok(STAND) });

      expect(await issueQr(t.deps, STAFF, { checkpointId: "stand-louis" })).toMatchObject({ ok: true, value: { checkpointId: "stand-louis" } });
    });

    it("do not show a stand's code when the edition keeps them off stands", async () => {
      const t = setup({ found: ok(STAND) });

      expect(await issueQr(t.deps, { ...STAFF, kinds: ["entrance", "catering"] }, { checkpointId: "stand-louis" })).toEqual(err(qrError("forbidden")));
      expect(t.encoder.encode).not.toHaveBeenCalled();
    });

    it("show only their own stand when an admin limited them, and are forbidden another one", async () => {
      const limited: QrActor = { ...STAFF, checkpointIds: ["stand-louis"] };

      expect(await issueQr(setup({ found: ok(STAND) }).deps, limited, { checkpointId: "stand-louis" })).toMatchObject({ ok: true });
      const other = setup({ found: ok(OTHER_STAND) });
      expect(await issueQr(other.deps, limited, { checkpointId: "stand-cloud" })).toEqual(err(qrError("forbidden")));
      expect(await issueQr(setup({ found: ok(DOOR) }).deps, limited, { checkpointId: "entrada-norte" })).toEqual(err(qrError("forbidden")));
      expect(other.encoder.encode).not.toHaveBeenCalled();
    });

    it("never show a talk's code, even when limited to that very checkpoint", async () => {
      const t = setup();

      expect(await issueQr(t.deps, { ...STAFF, checkpointIds: ["talk-keynote"] }, { checkpointId: "talk-keynote" })).toEqual(err(qrError("forbidden")));
    });

    it("are told the code is not for a screen when it is a meal, not that they lack permission", async () => {
      const t = setup({ found: ok({ ...DOOR, kind: "catering" }) });

      expect(await issueQr(t.deps, STAFF, { checkpointId: "entrada-norte" })).toEqual(err(qrError("not-shown-on-screen")));
    });
  });

  it("gives every screen a code of its own: two devices at the same door share nothing", async () => {
    const first = setup({ found: ok(DOOR), now: NOW });
    const second = setup({ found: ok(DOOR), now: NOW + 17_000 });

    const a = await issueQr(first.deps, STAFF, { checkpointId: "entrada-norte" });
    const b = await issueQr(second.deps, ADMIN, { checkpointId: "entrada-norte" });

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // Different codes, each with its own expiry, and nothing stored: the deps have no store to write to.
    expect(a.value.payload).not.toBe(b.value.payload);
    expect(a.value.expiresAt).not.toBe(b.value.expiresAt);
    // Both work at once, and neither depends on the other being shown.
    const now = NOW + 20_000;
    expect(verifyPayload({ signer, now: () => now }, a.value.payload)).toEqual({ ok: true, checkpointId: "entrada-norte" });
    expect(verifyPayload({ signer, now: () => now }, b.value.payload)).toEqual({ ok: true, checkpointId: "entrada-norte" });
    expect(Object.keys(first.deps).sort()).toEqual(["encoder", "lookup", "now", "signer"]);
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
