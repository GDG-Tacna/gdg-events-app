import { describe, expect, it, vi } from "vitest";
import { ok } from "@/shared/lib/result";

vi.mock("server-only", () => ({}));

const { recordCheckIn, FirstMatchQrPayloadVerifier, StaticQrPayloadVerifier, staticPayloadFor } =
  await import("@/features/checkins/server");
const { EphemeralQrPayloadVerifier, HmacTokenSigner, QrCodeEncoder, issueQr } = await import("@/features/ephemeral-qr/server");

/**
 * The real pieces wired together the way the composition roots do (real signer, QR encoder, verifiers and
 * use cases), with the database replaced by in-memory fakes. It proves the rules that cross features:
 * a talk counts only with a live code that the admin issued.
 */
const SECRET = "k".repeat(40);
const T0 = Date.UTC(2026, 9, 20, 14, 0, 0);

const checkpoints = {
  "talk-keynote": { id: "talk-keynote", kind: "talk", name: "Keynote", active: true },
  "lunch-1": { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true },
  "entrada-norte": { id: "entrada-norte", kind: "entrance", name: "Entrada norte", active: true },
  "entrada-sur": { id: "entrada-sur", kind: "entrance", name: "Entrada sur", active: true },
} as const;

function world() {
  const clock = { now: T0 };
  const signer = new HmacTokenSigner(() => SECRET);
  const catalog = {
    find: async (id: string) => ok(checkpoints[id as keyof typeof checkpoints] ?? null),
    listActive: async () => ok(Object.values(checkpoints)),
  };
  const stored = new Set<string>();
  const checkIns = {
    record: vi.fn(async ({ uid, checkpoint }: { uid: string; checkpoint: { id: string } }) => {
      const key = `${uid}_${checkpoint.id}`;
      if (stored.has(key)) return ok({ kind: "already-recorded" as const });
      stored.add(key);
      return ok({ kind: "recorded" as const, firstEntrance: false });
    }),
  };
  const track = vi.fn();
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
  const issue = (checkpointId: string) =>
    issueQr({ signer, encoder: new QrCodeEncoder(), lookup: catalog, now: () => clock.now }, { uid: "admin", role: "admin" }, { checkpointId });
  const issueAsStaff = (checkpointId: string) =>
    issueQr({ signer, encoder: new QrCodeEncoder(), lookup: catalog, now: () => clock.now }, { uid: "staff-1", role: "staff", kinds: ["entrance"] }, { checkpointId });
  return { clock, checkInDeps, issue, issueAsStaff, checkIns, track, scan: (uid: string, payload: string) => recordCheckIn(checkInDeps, { uid, payload }) };
}

describe("talk check-in with ephemeral codes", () => {
  it("counts a code the admin just issued, once per attendee", async () => {
    const w = world();
    const issued = await w.issue("talk-keynote");
    if (!issued.ok) throw new Error("issue failed");

    const first = await w.scan("u1", issued.value.payload);
    const again = await w.scan("u1", issued.value.payload);
    const other = await w.scan("u2", issued.value.payload);

    expect(first).toMatchObject({ ok: true, value: { kind: "talk", recorded: true } });
    expect(again).toMatchObject({ ok: true, value: { recorded: false } });
    expect(other).toMatchObject({ ok: true, value: { recorded: true } });
    expect(w.track).toHaveBeenCalledTimes(2);
  });

  it("still counts the code in its last second and stops after", async () => {
    const w = world();
    const issued = await w.issue("talk-keynote");
    if (!issued.ok) throw new Error("issue failed");

    w.clock.now = issued.value.expiresAt;
    expect(await w.scan("u1", issued.value.payload)).toMatchObject({ ok: true });

    w.clock.now = issued.value.expiresAt + 1000;
    expect(await w.scan("u2", issued.value.payload)).toEqual({ ok: false, error: { code: "expired-code" } });
    expect(w.checkIns.record).toHaveBeenCalledTimes(1);
  });

  it("a code issued later keeps working while an older one has expired (the screen refreshes before the end)", async () => {
    const w = world();
    const first = await w.issue("talk-keynote");
    w.clock.now += 100_000;
    const second = await w.issue("talk-keynote");
    if (!first.ok || !second.ok) throw new Error("issue failed");

    w.clock.now += 30_000; // 130 s after the first: expired; 30 s after the second: alive
    expect(await w.scan("u1", first.value.payload)).toEqual({ ok: false, error: { code: "expired-code" } });
    expect(await w.scan("u1", second.value.payload)).toMatchObject({ ok: true });
  });

  it("does not count a printed code for a talk, even a well-formed one", async () => {
    const w = world();

    expect(await w.scan("u1", staticPayloadFor("talk-keynote"))).toEqual({ ok: false, error: { code: "staff-station" } });
    expect(w.checkIns.record).not.toHaveBeenCalled();
  });

  it("rejects a code whose checkpoint was swapped for another talk, or whose expiry was stretched", async () => {
    const w = world();
    const issued = await w.issue("talk-keynote");
    if (!issued.ok) throw new Error("issue failed");
    const [, rest] = issued.value.payload.split("devfest:eq:");
    const [, expiry, signature] = rest.split(".");

    const swapped = `devfest:eq:talk-secret.${expiry}.${signature}`;
    const stretched = `devfest:eq:talk-keynote.${Number(expiry) + 600}.${signature}`;

    expect(await w.scan("u1", swapped)).toEqual({ ok: false, error: { code: "invalid-code" } });
    expect(await w.scan("u1", stretched)).toEqual({ ok: false, error: { code: "invalid-code" } });
    expect(w.checkIns.record).not.toHaveBeenCalled();
  });

  it("rejects a code signed with another secret", async () => {
    const w = world();
    const forgerSigner = new HmacTokenSigner(() => "z".repeat(40));
    const forged = await issueQr(
      { signer: forgerSigner, encoder: new QrCodeEncoder(), lookup: w.checkInDeps.catalog, now: () => w.clock.now },
      { uid: "admin", role: "admin" },
      { checkpointId: "talk-keynote" },
    );
    if (!forged.ok) throw new Error("issue failed");

    expect(await w.scan("u1", forged.value.payload)).toEqual({ ok: false, error: { code: "invalid-code" } });
  });

  it("never issues an ephemeral code for catering, and the cadet cannot check in there with a printed one (staff scan the pass)", async () => {
    const w = world();

    expect(await w.issue("lunch-1")).toEqual({ ok: false, error: { code: "not-shown-on-screen" } });
    expect(await w.scan("u1", staticPayloadFor("lunch-1"))).toEqual({ ok: false, error: { code: "staff-station" } });
    expect(w.checkIns.record).not.toHaveBeenCalled();
  });
});

describe("entrance check-in with ephemeral codes", () => {
  it("counts a code that staff put on the door screen, once per cadet, and not a minute later", async () => {
    const w = world();
    const issued = await w.issueAsStaff("entrada-norte");
    if (!issued.ok) throw new Error("issue failed");

    expect(await w.scan("u1", issued.value.payload)).toEqual(ok({ checkpointId: "entrada-norte", kind: "entrance", recorded: true, firstEntrance: false }));
    expect(await w.scan("u1", issued.value.payload)).toEqual(ok({ checkpointId: "entrada-norte", kind: "entrance", recorded: false, firstEntrance: false }));
    expect(w.track).toHaveBeenCalledTimes(1);

    // The code lives a minute: a screenshot sent a little later to someone outside is already dead.
    w.clock.now = T0 + 61_000;
    expect(await w.scan("u2", issued.value.payload)).toEqual({ ok: false, error: { code: "expired-code" } });
  });

  it("keeps two screens at the same door independent: each has its own code, and a cadet counts once whichever they scan", async () => {
    const w = world();
    const left = await w.issueAsStaff("entrada-norte");
    w.clock.now = T0 + 9_000;
    const right = await w.issue("entrada-norte");
    if (!left.ok || !right.ok) throw new Error("issue failed");
    expect(left.value.payload).not.toBe(right.value.payload);

    // Both work at the same time, with no screen waiting on the other or showing what the other did.
    expect(await w.scan("u1", left.value.payload)).toMatchObject({ ok: true, value: { recorded: true } });
    expect(await w.scan("u2", right.value.payload)).toMatchObject({ ok: true, value: { recorded: true } });
    // The same cadet on the other screen is the same check-in: nothing is counted twice.
    expect(await w.scan("u1", right.value.payload)).toMatchObject({ ok: true, value: { recorded: false } });
    expect(w.checkIns.record).toHaveBeenCalledTimes(3);
  });

  it("keeps two doors independent: each is its own puesto, so a cadet's entrance at one says nothing about the other", async () => {
    const w = world();
    const north = await w.issueAsStaff("entrada-norte");
    const south = await w.issueAsStaff("entrada-sur");
    if (!north.ok || !south.ok) throw new Error("issue failed");

    expect(await w.scan("u1", north.value.payload)).toMatchObject({ ok: true, value: { checkpointId: "entrada-norte", recorded: true } });
    expect(await w.scan("u1", south.value.payload)).toMatchObject({ ok: true, value: { checkpointId: "entrada-sur", recorded: true } });
  });

  it("does not let a code of one checkpoint count for another, nor a talk's code for the door", async () => {
    const w = world();
    const talk = await w.issue("talk-keynote");
    if (!talk.ok) throw new Error("issue failed");

    expect(await w.scan("u1", talk.value.payload.replace("talk-keynote", "entrada-norte"))).toEqual({ ok: false, error: { code: "invalid-code" } });
    expect(w.checkIns.record).not.toHaveBeenCalled();
  });

  it("never lets staff show a talk's code, and the cadet cannot check in at the catering with a screen code either", async () => {
    const w = world();

    expect(await w.issueAsStaff("talk-keynote")).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await w.issueAsStaff("lunch-1")).toEqual({ ok: false, error: { code: "not-shown-on-screen" } });
  });
});
