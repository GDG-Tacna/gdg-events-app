import { describe, expect, it, vi } from "vitest";
import { ok } from "@/shared/lib/result";

vi.mock("server-only", () => ({}));

const { recordCheckIn, FirstMatchQrPayloadVerifier, StaticQrPayloadVerifier, staticPayloadFor } =
  await import("@/features/checkins/server");
const { EphemeralQrPayloadVerifier, HmacTokenSigner, QrCodeEncoder, issueQr } = await import("@/features/ephemeral-qr/server");
const { serveAttendee, AllowAllServeGate } = await import("@/features/checkpoints/server");
const { issuePass, PassVerifier } = await import("@/features/pass/server");
const { completeByCheckpoint } = await import("@/features/missions/server");
type Mission = import("@/features/missions/server").Mission;
type MissionCompletion = import("@/features/missions/server").MissionCompletion;

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
  "stand-louis": { id: "stand-louis", kind: "stand", name: "Stand Louis 3D", active: true },
  "stand-cloud": { id: "stand-cloud", kind: "stand", name: "Stand Cloud", active: true },
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

    expect(await w.scan("u1", issued.value.payload)).toEqual(ok({ checkpointId: "entrada-norte", kind: "entrance", recorded: true, firstEntrance: false , checkpoint: { name: "Entrada norte", description: "", image: null } }));
    expect(await w.scan("u1", issued.value.payload)).toEqual(ok({ checkpointId: "entrada-norte", kind: "entrance", recorded: false, firstEntrance: false , checkpoint: { name: "Entrada norte", description: "", image: null } }));
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

describe("stand check-in with ephemeral codes", () => {
  /** «Visita el stand de Louis 3D»: a stand mission tied to the stand's puesto. */
  const VISIT: Mission = {
    id: "visit-louis",
    title: "Visita el stand de Louis 3D",
    description: "Pasa por el stand.",
    quadrantId: "ai",
    xp: 30,
    order: 0,
    active: true,
    credits: null,
    minigame: null,
    minigameDifficulty: null,
    config: { type: "stand", checkpointId: "stand-louis" },
  };

  /** The rest of the world a stand needs: its mission (in memory, paid once through a fake ledger) and the staff's scanner. */
  function standWorld() {
    const w = world();
    const signer = new HmacTokenSigner(() => SECRET);
    const rows = new Map<string, MissionCompletion>();
    const paid = new Set<string>();
    const missionDeps = {
      source: { list: async () => ok([VISIT] as readonly Mission[]) },
      completions: {
        listFor: async (uid: string) => ok([...rows.values()].filter((row) => row.uid === uid)),
        apply: async (uid: string, missionId: string, decide: Parameters<Parameters<typeof completeByCheckpoint>[0]["completions"]["apply"]>[2]) => {
          const before = rows.get(`${uid}_${missionId}`) ?? null;
          const evaluation = decide(before);
          if (evaluation.kind !== "next") return ok({ before, evaluation, after: before });
          const after: MissionCompletion = { uid, missionId, status: evaluation.status, attempts: evaluation.attempts, xpEarned: evaluation.xpEarned, creditsEarned: evaluation.creditsEarned, at: new Date(0) };
          rows.set(`${uid}_${missionId}`, after);
          return ok({ before, evaluation, after });
        },
      },
      xp: {
        grant: vi.fn(async ({ uid, source, xp }: { uid: string; source: string; xp: number }) => {
          const fresh = !paid.has(`${uid}_${source}`);
          paid.add(`${uid}_${source}`);
          return ok({ granted: fresh, total: xp });
        }),
      },
      limiter: { consume: async () => true },
    };
    const serveDeps = {
      checkpoints: w.checkInDeps.catalog,
      passes: new PassVerifier({ signer, now: () => w.clock.now }),
      attendees: { find: async () => ok({ alias: "Nova_7", squadId: null }) },
      recorder: w.checkIns,
      counter: { count: async () => ok(1) },
      gate: new AllowAllServeGate(),
      limiter: { consume: async () => true },
      analytics: { track: vi.fn() },
      now: () => new Date(w.clock.now),
    };
    const issueAsLouisTeam = (checkpointId: string) =>
      issueQr(
        { signer, encoder: new QrCodeEncoder(), lookup: w.checkInDeps.catalog, now: () => w.clock.now },
        { uid: "louis-staff", role: "staff", kinds: ["entrance", "catering", "stand"], checkpointIds: ["stand-louis"] },
        { checkpointId },
      );
    const passOf = (uid: string) => {
      const issued = issuePass({ signer, encoder: { encode: (text) => [text] }, now: () => w.clock.now }, { uid, role: "attendee" });
      if (!issued.ok) throw new Error("pass failed");
      return issued.value.cells[0];
    };
    return { ...w, missionDeps, serveDeps, issueAsLouisTeam, passOf };
  }

  it("completes the stand's mission when the cadet scans the code on the stand's tablet, and a later staff scan is the same visit", async () => {
    const w = standWorld();
    // A real uid's shape: the pass only carries ids like Firebase's.
    const CADET = "anaUid123456789";
    const issued = await w.issueAsLouisTeam("stand-louis");
    if (!issued.ok) throw new Error("issue failed");
    expect(issued.value.expiresAt - Math.floor(w.clock.now / 1000) * 1000).toBe(60_000);

    // The cadet scans the tablet: a stand visit, which the scanner action then turns into its missions.
    const scanned = await w.scan(CADET, issued.value.payload);
    expect(scanned).toEqual(ok({ checkpointId: "stand-louis", kind: "stand", recorded: true, firstEntrance: false , checkpoint: { name: "Stand Louis 3D", description: "", image: null } }));
    expect(await completeByCheckpoint(w.missionDeps, CADET, "stand-louis")).toEqual(ok([{ id: "visit-louis", title: "Visita el stand de Louis 3D", xpEarned: 30, creditsEarned: 0, justCompleted: true }]));
    expect(w.missionDeps.xp.grant).toHaveBeenCalledWith({ uid: CADET, source: "mission:visit-louis", xp: 30, credits: 0 });

    // Staff then scan the same cadet's pass at the same stand: it is the same check-in, already there.
    const served = await serveAttendee(w.serveDeps, { uid: "louis-staff", role: "staff", checkpointIds: ["stand-louis"] }, { checkpointId: "stand-louis", payload: w.passOf(CADET) });
    expect(served).toMatchObject({ ok: true, value: { kind: "stand", status: "already-served" } });
    expect(w.checkIns.record).toHaveBeenCalledTimes(2);
    expect(w.track).toHaveBeenCalledTimes(1);
  });

  it("keeps a stand's team on its own stand: no code for another stand, and the code dies after a minute", async () => {
    const w = standWorld();

    expect(await w.issueAsLouisTeam("stand-cloud")).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await w.issueAsLouisTeam("entrada-norte")).toEqual({ ok: false, error: { code: "forbidden" } });

    const issued = await w.issueAsLouisTeam("stand-louis");
    if (!issued.ok) throw new Error("issue failed");
    w.clock.now = T0 + 61_000;
    expect(await w.scan("u2", issued.value.payload)).toEqual({ ok: false, error: { code: "expired-code" } });
  });
});
