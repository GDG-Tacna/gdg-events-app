import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { checkCommunication, type Communication } from "./communication";
import { getOdyssey, type OdysseyDeps } from "./odyssey";

const comm = (id: string, order: number, unlockMissionId: string | null, extra: Partial<Communication> = {}): Communication => ({
  id,
  quadrantId: "ai",
  title: `Transmisión ${id}`,
  body: `Texto secreto de ${id}`,
  unlockMissionId,
  order,
  active: true,
  ...extra,
});

function setup(stored: Communication[], completed: string[] = []) {
  const deps = {
    source: { list: vi.fn(async (): Promise<Result<readonly Communication[], { code: string }>> => ok(stored)) },
    progress: {
      completedIds: vi.fn(async (): Promise<Result<ReadonlySet<string>, { code: string }>> => ok(new Set(completed))),
      titles: vi.fn(async (): Promise<Result<ReadonlyMap<string, string>, { code: string }>> => ok(new Map([["ai-stand", "Visita el stand de AI"]]))),
    },
    defaults: [comm("default-1", 0, null)],
  } satisfies OdysseyDeps;
  return deps;
}

describe("getOdyssey", () => {
  it("opens transmissions that need no mission or whose mission the attendee completed, in order", async () => {
    const deps = setup([comm("bb", 1, "ai-stand"), comm("aa", 0, null), comm("cc", 2, "ai-quiz")], ["ai-stand"]);

    const log = await getOdyssey(deps, "u1");

    expect(log.ok && log.value.transmissions.map((t) => [t.id, t.status])).toEqual([
      ["aa", "open"],
      ["bb", "open"],
      ["cc", "locked"],
    ]);
    expect(log.ok && [log.value.open, log.value.total]).toEqual([2, 3]);
    expect(deps.progress.completedIds).toHaveBeenCalledWith("u1");
  });

  it("never sends the text of a locked transmission, only what opens it", async () => {
    const log = await getOdyssey(setup([comm("locked", 0, "ai-stand"), comm("ghost", 1, "ghost-mission")]), "u1");

    expect(log.ok && log.value.transmissions).toEqual([
      { id: "locked", quadrantId: "ai", title: "Transmisión locked", status: "locked", unlockMission: "Visita el stand de AI" },
      { id: "ghost", quadrantId: "ai", title: "Transmisión ghost", status: "locked", unlockMission: "ghost-mission" },
    ]);
    expect(JSON.stringify(log)).not.toContain("Texto secreto");
  });

  it("hides inactive transmissions, and serves the bundled ones while the edition has none", async () => {
    const hidden = await getOdyssey(setup([comm("on", 0, null), comm("off", 1, null, { active: false })]), "u1");
    const bundled = await getOdyssey(setup([]), "u1");

    expect(hidden.ok && hidden.value.transmissions.map((t) => t.id)).toEqual(["on"]);
    expect(bundled.ok && bundled.value.transmissions.map((t) => t.id)).toEqual(["default-1"]);
  });

  it("orders ties by title", async () => {
    const log = await getOdyssey(setup([comm("zz", 0, null, { title: "Zeta" }), comm("aa", 0, null, { title: "Alfa" })]), "u1");

    expect(log.ok && log.value.transmissions.map((t) => t.id)).toEqual(["aa", "zz"]);
  });

  it.each(["source", "completed", "titles"] as const)("reports a failed read of the %s", async (which) => {
    const deps = setup([comm("aa", 0, null)]);
    if (which === "source") deps.source.list.mockResolvedValue(err({ code: "x" }));
    if (which === "completed") deps.progress.completedIds.mockResolvedValue(err({ code: "x" }));
    if (which === "titles") deps.progress.titles.mockResolvedValue(err({ code: "x" }));

    expect(await getOdyssey(deps, "u1")).toEqual(err({ code: "unknown" }));
  });
});

describe("checkCommunication", () => {
  const input = { quadrantId: "ai", title: "  Señal ", body: "Una señal llega desde AI.", unlockMissionId: "ai-stand", active: true, order: 2 };

  it("reads a communication, trimming its texts", () => {
    expect(checkCommunication("ai-senal", input)).toEqual({
      ok: true,
      value: { id: "ai-senal", quadrantId: "ai", title: "Señal", body: "Una señal llega desde AI.", unlockMissionId: "ai-stand", order: 2, active: true },
    });
    expect(checkCommunication("ai-senal", { ...input, unlockMissionId: undefined })).toMatchObject({ ok: true, value: { unlockMissionId: null } });
  });

  it.each([
    ["Bad Id", input, "invalid-id"],
    ["ok-id", { ...input, quadrantId: "" }, "invalid-quadrant"],
    ["ok-id", { ...input, title: "ab" }, "invalid-title"],
    ["ok-id", { ...input, body: "corto" }, "invalid-body"],
    ["ok-id", { ...input, body: "x".repeat(1001) }, "invalid-body"],
    ["ok-id", { ...input, unlockMissionId: "Bad Mission" }, "invalid-mission"],
  ])("refuses %s with %j", (id, data, code) => {
    expect(checkCommunication(id, data)).toEqual({ ok: false, code });
  });
});
