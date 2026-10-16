import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import {
  createMission,
  listManagedMissions,
  moveMission,
  seedMissions,
  setMissionActive,
  updateMission,
  type MissionAdminActor,
  type MissionAdminDeps,
  type MissionAuditEntry,
  type MissionDraft,
  type MissionPatch,
} from "./manage";
import type { Mission } from "./mission";

const ADMIN: MissionAdminActor = { uid: "a1", role: "admin" };
const NOW = new Date("2026-10-20T12:00:00Z");

const mission = (id: string, order: number, extra: Partial<Mission> = {}): Mission => ({
  id,
  title: `Misión ${id}`,
  description: "",
  quadrantId: "ai",
  xp: 40,
  order,
  active: true,
  credits: null,
  minigame: null,
  minigameDifficulty: null,
  config: { type: "quiz", question: "¿Pregunta?", options: ["aa", "bb"], answer: 0 },
  ...extra,
});

const QUIZ_DRAFT: MissionDraft = {
  title: "  Nuevo desafío ",
  description: "Responde",
  quadrantId: "ai",
  xp: 40,
  config: { type: "quiz", question: "¿Qué es Gemini?", options: ["Un modelo", "Un lenguaje"], answer: 0 },
};

function memoryStore(initial: Mission[]) {
  const rows = new Map(initial.map((m) => [m.id, m]));
  return {
    rows,
    list: vi.fn(async (): Promise<Result<readonly Mission[], { code: string }>> => ok([...rows.values()])),
    create: vi.fn(async (m: Mission): Promise<Result<void, { code: "already-exists" | "unknown" }>> => {
      if (rows.has(m.id)) return err({ code: "already-exists" });
      rows.set(m.id, m);
      return ok(undefined);
    }),
    update: vi.fn(async (id: string, patch: MissionPatch) => {
      const before = rows.get(id);
      if (!before) return ok(null);
      const after = { ...before, ...patch };
      rows.set(id, after);
      return ok({ before, after });
    }),
    setOrder: vi.fn(async (ids: readonly string[]) => {
      ids.forEach((id, order) => rows.set(id, { ...rows.get(id)!, order }));
      return ok(undefined);
    }),
  };
}

function setup(initial: Mission[] = [mission("bb", 1), mission("aa", 0), mission("cc", 2)]) {
  const entries: MissionAuditEntry[] = [];
  const store = memoryStore(initial);
  const deps = {
    store,
    quadrants: { activeIds: vi.fn(async () => ok(new Set(["ai", "cloud"]) as ReadonlySet<string>)) },
    checkpoints: { kindOf: vi.fn(async (id: string): Promise<Result<string | null, { code: string }>> => ok(id.startsWith("talk-") ? "talk" : id.startsWith("stand-") ? "stand" : null)) },
    speakers: { activeIds: vi.fn(async (): Promise<Result<ReadonlySet<string>, { code: string }>> => ok(new Set(["ana-torres"]))) },
    minigames: { ids: ["circuits", "bug-kong"] },
    images: { ref: vi.fn((path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null)), remove: vi.fn(async () => {}) },
    audit: { append: vi.fn(async (entry: MissionAuditEntry) => (entries.push(entry), ok(undefined))) },
    now: () => NOW,
  } satisfies MissionAdminDeps;
  return { deps, store, entries };
}

describe("mission admin", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it.each([
    ["staff", { uid: "s1", role: "staff" }],
    ["an attendee", { uid: "u1", role: "attendee" }],
    ["no role", { uid: "x", role: null }],
  ] as const)("refuses %s everything", async (_, actor) => {
    const forbidden = err({ code: "forbidden" });
    expect(await listManagedMissions(ctx.deps, actor)).toEqual(forbidden);
    expect(await seedMissions(ctx.deps, actor, [])).toEqual(forbidden);
    expect(await createMission(ctx.deps, actor, { id: "new-1", draft: QUIZ_DRAFT })).toEqual(forbidden);
    expect(await updateMission(ctx.deps, actor, { id: "aa", draft: QUIZ_DRAFT })).toEqual(forbidden);
    expect(await setMissionActive(ctx.deps, actor, { id: "aa", active: false })).toEqual(forbidden);
    expect(await moveMission(ctx.deps, actor, { id: "aa", to: 1 })).toEqual(forbidden);
    expect(ctx.store.create).not.toHaveBeenCalled();
    expect(ctx.store.update).not.toHaveBeenCalled();
  });

  it("lists every mission in order", async () => {
    const listed = await listManagedMissions(ctx.deps, ADMIN);

    expect(listed.ok && listed.value.map((m) => m.id)).toEqual(["aa", "bb", "cc"]);
  });

  describe("seed", () => {
    it("saves the bundled missions with their ids into an empty edition, and audits it", async () => {
      const empty = setup([]);

      const result = await seedMissions(empty.deps, ADMIN, [mission("x", 0), mission("y", 1)]);

      expect(result.ok && result.value.map((m) => m.id)).toEqual(["x", "y"]);
      expect([...empty.store.rows.keys()]).toEqual(["x", "y"]);
      expect(empty.entries).toEqual([{ action: "missions.seeded", actorUid: "a1", targetUid: "missions", details: { ids: "x,y" }, at: NOW }]);
    });

    it("never seeds over existing missions", async () => {
      expect(await seedMissions(ctx.deps, ADMIN, [mission("x", 0)])).toEqual(err({ code: "already-seeded" }));
      expect(ctx.store.create).not.toHaveBeenCalled();
    });

    it("keeps what another admin seeded at the same time", async () => {
      const empty = setup([]);
      empty.store.create.mockResolvedValueOnce(err({ code: "already-exists" }));

      const result = await seedMissions(empty.deps, ADMIN, [mission("x", 0), mission("y", 1)]);

      expect(result.ok && result.value.map((m) => m.id)).toEqual(["y"]);
    });
  });

  describe("create", () => {
    it("creates an active mission at the end, trimmed, and audits it", async () => {
      const result = await createMission(ctx.deps, ADMIN, { id: "ai-new", draft: QUIZ_DRAFT });

      expect(result).toEqual(ok(expect.objectContaining({ id: "ai-new", title: "Nuevo desafío", order: 3, active: true })));
      expect(ctx.store.rows.has("ai-new")).toBe(true);
      expect(ctx.entries[0]).toMatchObject({ action: "mission.created", targetUid: "ai-new", details: { title: "Nuevo desafío", type: "quiz", minigame: null } });
    });

    it("assigns a known mini-game with an optional difficulty of its own", async () => {
      const result = await createMission(ctx.deps, ADMIN, { id: "ai-game", draft: { ...QUIZ_DRAFT, minigame: "circuits", minigameDifficulty: "hard" } });

      expect(result).toMatchObject({ ok: true, value: { minigame: "circuits", minigameDifficulty: "hard" } });
      expect(ctx.store.rows.get("ai-game")).toMatchObject({ minigame: "circuits", minigameDifficulty: "hard" });
      expect(ctx.entries[0].details).toMatchObject({ minigame: "circuits" });
      expect(await createMission(ctx.deps, ADMIN, { id: "ai-game-2", draft: { ...QUIZ_DRAFT, minigame: "bug-kong", minigameDifficulty: null } })).toMatchObject({
        ok: true,
        value: { minigame: "bug-kong", minigameDifficulty: null },
      });
    });

    it("refuses a game that is not built, or a difficulty it does not have", async () => {
      expect(await createMission(ctx.deps, ADMIN, { id: "m-1", draft: { ...QUIZ_DRAFT, minigame: "asteroids" } })).toEqual(err({ code: "unknown-minigame" }));
      expect(await createMission(ctx.deps, ADMIN, { id: "m-1", draft: { ...QUIZ_DRAFT, minigame: "circuits", minigameDifficulty: "insane" } })).toEqual(
        err({ code: "invalid-minigame-difficulty" }),
      );
      expect(ctx.store.create).not.toHaveBeenCalled();
    });

    it("drops a difficulty sent without a game", async () => {
      expect(await createMission(ctx.deps, ADMIN, { id: "m-1", draft: { ...QUIZ_DRAFT, minigame: null, minigameDifficulty: "easy" } })).toMatchObject({
        ok: true,
        value: { minigame: null, minigameDifficulty: null },
      });
    });

    it("puts the first mission of an empty edition at the top", async () => {
      const empty = setup([]);

      expect(await createMission(empty.deps, ADMIN, { id: "first", draft: QUIZ_DRAFT })).toMatchObject({ ok: true, value: { order: 0 } });
    });

    it("says which field is wrong", async () => {
      expect(await createMission(ctx.deps, ADMIN, { id: "Bad Id", draft: QUIZ_DRAFT })).toEqual(err({ code: "invalid-id" }));
      expect(await createMission(ctx.deps, ADMIN, { id: "m-1", draft: { ...QUIZ_DRAFT, title: "x" } })).toEqual(err({ code: "invalid-title" }));
      expect(await createMission(ctx.deps, ADMIN, { id: "m-1", draft: { ...QUIZ_DRAFT, xp: 0 } })).toEqual(err({ code: "invalid-xp" }));
      expect(await createMission(ctx.deps, ADMIN, { id: "m-1", draft: { ...QUIZ_DRAFT, config: { ...(QUIZ_DRAFT.config as object), answer: 5 } } })).toEqual(err({ code: "invalid-answer" }));
      expect(ctx.store.create).not.toHaveBeenCalled();
    });

    it("refuses a quadrant that is not active in the edition", async () => {
      expect(await createMission(ctx.deps, ADMIN, { id: "m-1", draft: { ...QUIZ_DRAFT, quadrantId: "android" } })).toEqual(err({ code: "unknown-quadrant" }));
    });

    it("needs a checkpoint of the mission's own kind for talks and stands", async () => {
      const talk = { ...QUIZ_DRAFT, config: { type: "talk", checkpointId: "talk-keynote" } };
      const stand = { ...QUIZ_DRAFT, config: { type: "stand", checkpointId: "stand-ai-1" } };

      expect(await createMission(ctx.deps, ADMIN, { id: "talk-1", draft: talk })).toMatchObject({ ok: true });
      expect(await createMission(ctx.deps, ADMIN, { id: "stand-1", draft: stand })).toMatchObject({ ok: true });
      expect(await createMission(ctx.deps, ADMIN, { id: "talk-2", draft: { ...talk, config: { type: "talk", checkpointId: "stand-ai-1" } } })).toEqual(err({ code: "unknown-checkpoint" }));
      expect(await createMission(ctx.deps, ADMIN, { id: "stand-2", draft: { ...stand, config: { type: "stand", checkpointId: "ghost" } } })).toEqual(err({ code: "unknown-checkpoint" }));
    });

    it("needs an active speaker of the edition for a «Conoce al speaker» mission", async () => {
      const meet = { ...QUIZ_DRAFT, config: { type: "speaker", speakerId: "ana-torres" } };

      expect(await createMission(ctx.deps, ADMIN, { id: "meet-ana", draft: meet })).toMatchObject({ ok: true, value: { config: { type: "speaker", speakerId: "ana-torres" } } });
      expect(await createMission(ctx.deps, ADMIN, { id: "meet-zoe", draft: { ...meet, config: { type: "speaker", speakerId: "zoe" } } })).toEqual(err({ code: "unknown-speaker" }));
      expect(await createMission(ctx.deps, ADMIN, { id: "meet-bad", draft: { ...meet, config: { type: "speaker", speakerId: "Ana" } } })).toEqual(err({ code: "invalid-speaker" }));

      ctx.deps.speakers.activeIds.mockResolvedValueOnce(err({ code: "x" }));
      expect(await createMission(ctx.deps, ADMIN, { id: "meet-2", draft: meet })).toEqual(err({ code: "unknown" }));
    });

    it("never takes an id that exists", async () => {
      expect(await createMission(ctx.deps, ADMIN, { id: "aa", draft: QUIZ_DRAFT })).toEqual(err({ code: "already-exists" }));
    });

    it("reports failed reads of the edition", async () => {
      ctx.deps.quadrants.activeIds.mockResolvedValueOnce(err({ code: "x" }) as never);
      expect(await createMission(ctx.deps, ADMIN, { id: "m-1", draft: QUIZ_DRAFT })).toEqual(err({ code: "unknown" }));

      ctx.deps.checkpoints.kindOf.mockResolvedValueOnce(err({ code: "x" }));
      expect(await createMission(ctx.deps, ADMIN, { id: "m-2", draft: { ...QUIZ_DRAFT, config: { type: "talk", checkpointId: "talk-1" } } })).toEqual(err({ code: "unknown" }));

      ctx.store.list.mockResolvedValueOnce(err({ code: "x" }));
      expect(await createMission(ctx.deps, ADMIN, { id: "m-3", draft: QUIZ_DRAFT })).toEqual(err({ code: "unknown" }));
    });
  });

  describe("update", () => {
    it("changes the mission and audits only the fields that changed", async () => {
      const result = await updateMission(ctx.deps, ADMIN, { id: "aa", draft: { ...QUIZ_DRAFT, title: "Misión aa", xp: 60 } });

      expect(result).toMatchObject({ ok: true, value: { id: "aa", xp: 60, order: 0, active: true } });
      expect(ctx.entries).toEqual([{ action: "mission.updated", actorUid: "a1", targetUid: "aa", details: { changed: "description,xp,config" }, at: NOW }]);
    });

    it("sets, keeps and removes the picture, deleting the replaced one and auditing it", async () => {
      const first = "public/devfest-2026/mission/0f8e2c1a-1111-4222-8333-944455550000.webp";
      const second = "public/devfest-2026/mission/0f8e2c1a-1111-4222-8333-944455551111.webp";
      const draft = { ...QUIZ_DRAFT, title: "Misión aa" };

      await updateMission(ctx.deps, ADMIN, { id: "aa", draft: { ...draft, imagePath: first } });
      expect(ctx.store.rows.get("aa")?.image).toEqual({ path: first, url: `https://cdn/${first}` });
      expect(ctx.entries.at(-1)?.details.changed).toContain("image");

      await updateMission(ctx.deps, ADMIN, { id: "aa", draft });
      expect(ctx.store.rows.get("aa")?.image?.path).toBe(first);

      await updateMission(ctx.deps, ADMIN, { id: "aa", draft: { ...draft, imagePath: second } });
      expect(ctx.deps.images.remove).toHaveBeenCalledWith(first);
      await updateMission(ctx.deps, ADMIN, { id: "aa", draft: { ...draft, imagePath: null } });
      expect(ctx.store.rows.get("aa")?.image).toBeNull();
      expect(ctx.deps.images.remove).toHaveBeenLastCalledWith(second);

      expect(await updateMission(ctx.deps, ADMIN, { id: "aa", draft: { ...draft, imagePath: "public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455551111.webp" } })).toEqual(
        err({ code: "invalid-image" }),
      );
      expect(await createMission(ctx.deps, ADMIN, { id: "nueva", draft: { ...draft, imagePath: "https://evil.example/x.webp" } })).toEqual(err({ code: "invalid-image" }));
    });

    it("assigns, changes and removes the mini-game, auditing each change", async () => {
      await updateMission(ctx.deps, ADMIN, { id: "aa", draft: { ...QUIZ_DRAFT, minigame: "circuits" } });
      expect(ctx.store.rows.get("aa")).toMatchObject({ minigame: "circuits", minigameDifficulty: null });
      expect(ctx.entries.at(-1)?.details.changed).toContain("minigame");

      await updateMission(ctx.deps, ADMIN, { id: "aa", draft: { ...QUIZ_DRAFT, minigame: "circuits", minigameDifficulty: "easy" } });
      expect(ctx.store.rows.get("aa")).toMatchObject({ minigame: "circuits", minigameDifficulty: "easy" });
      expect(ctx.entries.at(-1)?.details.changed).toBe("minigameDifficulty");

      await updateMission(ctx.deps, ADMIN, { id: "aa", draft: { ...QUIZ_DRAFT, minigame: null, minigameDifficulty: "easy" } });
      expect(ctx.store.rows.get("aa")).toMatchObject({ minigame: null, minigameDifficulty: null });
      expect(ctx.entries.at(-1)?.details.changed).toBe("minigame,minigameDifficulty");
    });

    it("refuses an unknown game on update too", async () => {
      expect(await updateMission(ctx.deps, ADMIN, { id: "aa", draft: { ...QUIZ_DRAFT, minigame: "asteroids" } })).toEqual(err({ code: "unknown-minigame" }));
      expect(ctx.store.update).not.toHaveBeenCalled();
    });

    it("writes no audit line when nothing changed", async () => {
      const same = mission("aa", 0);
      await updateMission(ctx.deps, ADMIN, { id: "aa", draft: { title: same.title, description: "", quadrantId: "ai", xp: 40, config: same.config } });

      expect(ctx.entries).toEqual([]);
    });

    it("never changes a mission's type", async () => {
      expect(await updateMission(ctx.deps, ADMIN, { id: "aa", draft: { ...QUIZ_DRAFT, config: { type: "keyword", prompt: "Pide la clave", keywords: ["x1"] } } })).toEqual(
        err({ code: "type-change" }),
      );
      expect(ctx.store.update).not.toHaveBeenCalled();
    });

    it("is not found for an unknown mission", async () => {
      expect(await updateMission(ctx.deps, ADMIN, { id: "zz", draft: QUIZ_DRAFT })).toEqual(err({ code: "not-found" }));
      expect(await updateMission(ctx.deps, ADMIN, { id: "Bad Id", draft: QUIZ_DRAFT })).toEqual(err({ code: "not-found" }));
    });
  });

  describe("activate and deactivate", () => {
    it("hides and shows a mission at any time, auditing each real change", async () => {
      expect(await setMissionActive(ctx.deps, ADMIN, { id: "aa", active: false })).toMatchObject({ ok: true, value: { active: false } });
      await setMissionActive(ctx.deps, ADMIN, { id: "aa", active: false });
      await setMissionActive(ctx.deps, ADMIN, { id: "aa", active: true });

      expect(ctx.entries.map((entry) => entry.action)).toEqual(["mission.deactivated", "mission.activated"]);
    });

    it("is not found for an unknown mission", async () => {
      expect(await setMissionActive(ctx.deps, ADMIN, { id: "zz", active: false })).toEqual(err({ code: "not-found" }));
    });
  });

  describe("move", () => {
    it("moves a mission to the place it was dropped on and saves the order", async () => {
      expect(await moveMission(ctx.deps, ADMIN, { id: "bb", to: 0 })).toEqual(ok(["bb", "aa", "cc"]));
      expect(ctx.store.setOrder).toHaveBeenCalledWith(["bb", "aa", "cc"]);
      expect(ctx.entries[0]).toMatchObject({ action: "mission.reordered", targetUid: "bb" });
    });

    it("moves several places at once, the others shifting", async () => {
      expect(await moveMission(ctx.deps, ADMIN, { id: "aa", to: 2 })).toEqual(ok(["bb", "cc", "aa"]));
      expect(ctx.store.setOrder).toHaveBeenCalledWith(["bb", "cc", "aa"]);
    });

    it("clamps a place past either end", async () => {
      expect(await moveMission(ctx.deps, ADMIN, { id: "cc", to: -4 })).toEqual(ok(["cc", "aa", "bb"]));
    });

    it("does nothing when it stays in its place", async () => {
      expect(await moveMission(ctx.deps, ADMIN, { id: "aa", to: 0 })).toEqual(ok(["aa", "bb", "cc"]));
      expect(await moveMission(ctx.deps, ADMIN, { id: "cc", to: 9 })).toEqual(ok(["aa", "bb", "cc"]));
      expect(ctx.store.setOrder).not.toHaveBeenCalled();
    });

    it("is not found for an unknown mission", async () => {
      expect(await moveMission(ctx.deps, ADMIN, { id: "zz", to: 0 })).toEqual(err({ code: "not-found" }));
    });
  });

  it("keeps a change that happened when its audit line cannot be written, and logs it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    ctx.deps.audit.append.mockResolvedValue(err({ code: "x" }) as never);

    expect(await setMissionActive(ctx.deps, ADMIN, { id: "aa", active: false })).toMatchObject({ ok: true });
    expect(console.error).toHaveBeenCalled();
  });
});
