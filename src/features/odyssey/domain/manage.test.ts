import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import type { Communication } from "./communication";
import {
  createCommunication,
  listManagedCommunications,
  moveCommunication,
  seedCommunications,
  setCommunicationActive,
  updateCommunication,
  type CommunicationDraft,
  type CommunicationPatch,
  type OdysseyAdminDeps,
  type OdysseyAuditEntry,
} from "./manage";

const ADMIN = { uid: "a1", role: "admin" } as const;
const comm = (id: string, order: number, extra: Partial<Communication> = {}): Communication => ({
  id,
  quadrantId: "ai",
  title: `Transmisión ${id}`,
  body: "Texto de la transmisión",
  unlockMissionId: null,
  order,
  active: true,
  ...extra,
});
const DRAFT: CommunicationDraft = { quadrantId: "ai", title: "Nueva señal", body: "Una señal llega desde AI.", unlockMissionId: "ai-stand" };

function setup(initial: Communication[] = [comm("bb", 1), comm("aa", 0), comm("cc", 2)]) {
  const rows = new Map(initial.map((c) => [c.id, c]));
  const entries: OdysseyAuditEntry[] = [];
  const deps = {
    store: {
      list: vi.fn(async (): Promise<Result<readonly Communication[], { code: string }>> => ok([...rows.values()])),
      create: vi.fn(async (c: Communication): Promise<Result<void, { code: "already-exists" | "unknown" }>> => {
        if (rows.has(c.id)) return err({ code: "already-exists" });
        rows.set(c.id, c);
        return ok(undefined);
      }),
      update: vi.fn(async (id: string, patch: CommunicationPatch) => {
        const before = rows.get(id);
        if (!before) return ok(null);
        const after = { ...before, ...patch };
        rows.set(id, after);
        return ok({ before, after });
      }),
      setOrder: vi.fn(async () => ok(undefined)),
    },
    directory: {
      activeQuadrantIds: vi.fn(async (): Promise<Result<ReadonlySet<string>, { code: string }>> => ok(new Set(["ai", "cloud"]))),
      missionIds: vi.fn(async (): Promise<Result<ReadonlySet<string>, { code: string }>> => ok(new Set(["ai-stand", "keynote"]))),
    },
    audit: { append: vi.fn(async (entry: OdysseyAuditEntry) => (entries.push(entry), ok(undefined))) },
    now: () => new Date(0),
  } satisfies OdysseyAdminDeps;
  return { deps, rows, entries };
}

describe("communication admin", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("refuses anyone but an admin", async () => {
    const staff = { uid: "s1", role: "staff" } as const;
    const forbidden = err({ code: "forbidden" });
    expect(await listManagedCommunications(ctx.deps, staff)).toEqual(forbidden);
    expect(await seedCommunications(ctx.deps, staff, [])).toEqual(forbidden);
    expect(await createCommunication(ctx.deps, staff, { id: "new-one", draft: DRAFT })).toEqual(forbidden);
    expect(await updateCommunication(ctx.deps, staff, { id: "aa", draft: DRAFT })).toEqual(forbidden);
    expect(await setCommunicationActive(ctx.deps, staff, { id: "aa", active: false })).toEqual(forbidden);
    expect(await moveCommunication(ctx.deps, staff, { id: "aa", to: 1 })).toEqual(forbidden);
    expect(ctx.deps.store.create).not.toHaveBeenCalled();
  });

  it("lists in order, and seeds only an empty edition", async () => {
    const listed = await listManagedCommunications(ctx.deps, ADMIN);
    expect(listed.ok && listed.value.map((c) => c.id)).toEqual(["aa", "bb", "cc"]);
    expect(await seedCommunications(ctx.deps, ADMIN, [comm("x1", 0)])).toEqual(err({ code: "already-seeded" }));

    const empty = setup([]);
    expect(await seedCommunications(empty.deps, ADMIN, [comm("x1", 0), comm("x2", 1)])).toMatchObject({ ok: true, value: [{ id: "x1" }, { id: "x2" }] });
    expect(empty.entries[0]).toMatchObject({ action: "communications.seeded", details: { ids: "x1,x2" } });
  });

  it("creates one at the end, and audits it", async () => {
    expect(await createCommunication(ctx.deps, ADMIN, { id: "ai-nueva", draft: DRAFT })).toMatchObject({ ok: true, value: { id: "ai-nueva", order: 3, active: true, unlockMissionId: "ai-stand" } });
    expect(ctx.entries[0]).toMatchObject({ action: "communication.created", targetUid: "ai-nueva" });
  });

  it("refuses an inactive quadrant, an unknown mission, a wrong field or a taken id", async () => {
    expect(await createCommunication(ctx.deps, ADMIN, { id: "n1", draft: { ...DRAFT, quadrantId: "android" } })).toEqual(err({ code: "unknown-quadrant" }));
    expect(await createCommunication(ctx.deps, ADMIN, { id: "n1", draft: { ...DRAFT, unlockMissionId: "ghost" } })).toEqual(err({ code: "unknown-mission" }));
    expect(await createCommunication(ctx.deps, ADMIN, { id: "n1", draft: { ...DRAFT, body: "corto" } })).toEqual(err({ code: "invalid-body" }));
    expect(await createCommunication(ctx.deps, ADMIN, { id: "aa", draft: DRAFT })).toEqual(err({ code: "already-exists" }));
    expect(await createCommunication(ctx.deps, ADMIN, { id: "n2", draft: { ...DRAFT, unlockMissionId: null } })).toMatchObject({ ok: true });
  });

  it("updates, auditing only what changed, and is not found for an unknown one", async () => {
    await updateCommunication(ctx.deps, ADMIN, { id: "aa", draft: { quadrantId: "ai", title: "Transmisión aa", body: "Texto nuevo de la señal", unlockMissionId: "keynote" } });
    expect(ctx.entries[0].details).toEqual({ changed: "body,unlockMissionId" });

    expect(await updateCommunication(ctx.deps, ADMIN, { id: "zz", draft: DRAFT })).toEqual(err({ code: "not-found" }));
  });

  it("activates, deactivates and moves", async () => {
    await setCommunicationActive(ctx.deps, ADMIN, { id: "aa", active: false });
    await setCommunicationActive(ctx.deps, ADMIN, { id: "aa", active: false });
    expect(ctx.entries.map((e) => e.action)).toEqual(["communication.deactivated"]);

    expect(await moveCommunication(ctx.deps, ADMIN, { id: "bb", to: 0 })).toEqual(ok(["bb", "aa", "cc"]));
    expect(await moveCommunication(ctx.deps, ADMIN, { id: "aa", to: 0 })).toEqual(ok(["aa", "bb", "cc"]));
    expect(ctx.deps.store.setOrder).toHaveBeenCalledTimes(1);
  });
});
