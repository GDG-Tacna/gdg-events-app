import { describe, expect, it, vi } from "vitest";
import { ok } from "@/shared/lib/result";

vi.mock("server-only", () => ({}));

const { serveAttendee, AllowAllServeGate } = await import("@/features/checkpoints/server");
const { issuePass, PassVerifier } = await import("@/features/pass/server");
const { recordCheckIn, FirstMatchQrPayloadVerifier, StaticQrPayloadVerifier, staticPayloadFor } = await import("@/features/checkins/server");
const { EphemeralQrPayloadVerifier, HmacTokenSigner, QrCodeEncoder, issueQr } = await import("@/features/ephemeral-qr/server");

/**
 * The real pieces wired the way the composition roots do (real signer, QR encoder, verifiers and use
 * cases) with the database replaced by one in-memory store. It proves the rules that cross features: one
 * ration per person and meal, a printed station code no longer counts when the cadet scans it (staff scan the
 * pass there), and a pass can never be forged or reused as another kind of code.
 */
const SECRET = "k".repeat(40);
const T0 = Date.UTC(2026, 9, 20, 13, 0, 0);
const UID_ANA = "anaUid123456789";
const UID_BRUNO = "brunoUid12345678";

const checkpoints = {
  "lunch-1": { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true },
  "talk-keynote": { id: "talk-keynote", kind: "talk", name: "Keynote", active: true },
  "stand-cloud": { id: "stand-cloud", kind: "stand", name: "Stand Cloud", active: true },
} as const;

function world() {
  const clock = { now: T0 };
  const signer = new HmacTokenSigner(() => SECRET);
  const encoder = new QrCodeEncoder();
  const catalog = {
    find: async (id: string) => ok(checkpoints[id as keyof typeof checkpoints] ?? null),
    listActive: async () => ok(Object.values(checkpoints)),
  };
  const rations = new Set<string>();
  const checkIns = {
    record: async ({ uid, checkpoint }: { uid: string; checkpoint: { id: string } }) => {
      const key = `${uid}_${checkpoint.id}`;
      if (rations.has(key)) return ok({ kind: "already-recorded" as const });
      rations.add(key);
      return ok({ kind: "recorded" as const, firstEntrance: false });
    },
  };
  const profiles: Record<string, { alias: string; squadId: string | null }> = {
    [UID_ANA]: { alias: "Nova_7", squadId: "gemini" },
    [UID_BRUNO]: { alias: "Orion", squadId: null },
  };
  const track = vi.fn();
  const serveDeps = {
    checkpoints: catalog,
    passes: new PassVerifier({ signer, now: () => clock.now }),
    attendees: { find: async (uid: string) => ok(profiles[uid] ?? null) },
    recorder: checkIns,
    counter: { count: async (id: string) => ok([...rations].filter((key) => key.endsWith(`_${id}`)).length) },
    gate: new AllowAllServeGate(),
    limiter: { consume: async () => true },
    analytics: { track },
    now: () => new Date(clock.now),
  };
  const checkInDeps = {
    checkIns,
    catalog,
    verifier: new FirstMatchQrPayloadVerifier([
      new StaticQrPayloadVerifier(),
      new EphemeralQrPayloadVerifier({ signer, now: () => clock.now }),
    ]),
    limiter: { consume: async () => true },
    analytics: { track },
    now: () => new Date(clock.now),
  };
  const passFor = (uid: string) => {
    // The pass text stays on the server; the test reads it back by decoding nothing: it signs the same way the use case does.
    const issued = issuePass({ signer, encoder: { encode: (text) => [text] }, now: () => clock.now }, { uid, role: "attendee" });
    if (!issued.ok) throw new Error("issue failed");
    return issued.value.cells[0];
  };
  return {
    clock,
    signer,
    encoder,
    track,
    serveDeps,
    checkInDeps,
    passFor,
    staff: { uid: "staff-1", role: "staff" as const },
    serve: (uid: string, checkpointId = "lunch-1") =>
      serveAttendee(serveDeps, { uid: "staff-1", role: "staff" }, { checkpointId, payload: passFor(uid) }),
  };
}

describe("rations", () => {
  it("serves a ration from the attendee's own pass, and counts it", async () => {
    const w = world();

    expect(await w.serve(UID_ANA)).toEqual(ok({ uid: UID_ANA, kind: "catering", status: "served", firstEntrance: false, alias: "Nova_7", squadId: "gemini", servedCount: 1 }));
    expect(await w.serve(UID_BRUNO)).toEqual(ok({ uid: UID_BRUNO, kind: "catering", status: "served", firstEntrance: false, alias: "Orion", squadId: null, servedCount: 2 }));
  });

  it("stops the double ration: scanning the same attendee again changes nothing", async () => {
    const w = world();
    await w.serve(UID_ANA);
    w.clock.now += 20_000; // a fresh pass, a new scan

    expect(await w.serve(UID_ANA)).toEqual(ok({ uid: UID_ANA, kind: "catering", status: "already-served", firstEntrance: false, alias: "Nova_7", squadId: "gemini", servedCount: 1 }));
    expect(w.track).toHaveBeenCalledTimes(1);
  });

  it("a cadet scanning a printed station code is told staff scan it, and nothing is recorded", async () => {
    const w = world();

    for (const id of ["lunch-1", "stand-cloud"]) {
      expect(await recordCheckIn(w.checkInDeps, { uid: UID_ANA, payload: staticPayloadFor(id) })).toEqual({ ok: false, error: { code: "staff-station" } });
    }
    expect(await w.serve(UID_ANA)).toMatchObject({ ok: true, value: { status: "served", servedCount: 1 } });
  });

  it("records a stand visit once per cadet when staff scan the pass", async () => {
    const w = world();

    expect(await w.serve(UID_ANA, "stand-cloud")).toMatchObject({ ok: true, value: { kind: "stand", status: "served", servedCount: 1 } });
    w.clock.now += 20_000;
    expect(await w.serve(UID_ANA, "stand-cloud")).toMatchObject({ ok: true, value: { kind: "stand", status: "already-served", servedCount: 1 } });
  });

  it("refuses a pass whose minute is over, and asks for the current one", async () => {
    const w = world();
    const old = w.passFor(UID_ANA);
    w.clock.now += 120_000;

    const result = await serveAttendee(w.serveDeps, w.staff, { checkpointId: "lunch-1", payload: old });

    expect(result).toEqual({ ok: false, error: { code: "expired-code" } });
  });

  it("refuses a pass for someone else made by swapping the uid or stretching the expiry", async () => {
    const w = world();
    const [, rest] = w.passFor(UID_ANA).split("devfest:at:");
    const [, expiry, signature] = rest.split(".");

    const swapped = `devfest:at:${UID_BRUNO}.${expiry}.${signature}`;
    const stretched = `devfest:at:${UID_ANA}.${Number(expiry) + 600}.${signature}`;

    for (const payload of [swapped, stretched]) {
      expect(await serveAttendee(w.serveDeps, w.staff, { checkpointId: "lunch-1", payload })).toEqual({
        ok: false,
        error: { code: "invalid-code" },
      });
    }
    expect(w.track).not.toHaveBeenCalled();
  });

  it("never accepts a talk code as a pass, even one with a valid signature", async () => {
    const w = world();
    const issued = await issueQr(
      { signer: w.signer, encoder: w.encoder, lookup: w.checkInDeps.catalog, now: () => w.clock.now },
      { uid: "admin", role: "admin" },
      { checkpointId: "talk-keynote" },
    );
    if (!issued.ok) throw new Error("issue failed");

    const result = await serveAttendee(w.serveDeps, w.staff, { checkpointId: "lunch-1", payload: issued.value.payload });

    expect(result).toEqual({ ok: false, error: { code: "invalid-code" } });
  });

  it("never accepts a pass as a talk code", async () => {
    const w = world();

    const result = await recordCheckIn(w.checkInDeps, { uid: UID_ANA, payload: w.passFor(UID_ANA) });

    expect(result).toEqual({ ok: false, error: { code: "invalid-code" } });
  });

  it("never lets staff check a cadet into a talk: talks are proven by the code on the talk's screen", async () => {
    const w = world();

    expect(await w.serve(UID_ANA, "talk-keynote")).toEqual({ ok: false, error: { code: "not-station" } });
  });
});
