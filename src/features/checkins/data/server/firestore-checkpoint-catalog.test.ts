import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreCheckpointCatalog } = await import("./firestore-checkpoint-catalog");

function catalogWith(docs: Record<string, unknown>) {
  const reads: string[] = [];
  const db = {
    collection: withEventScope((name: string) => ({
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => {
          reads.push(`${name}?${field}==${String(value)}`);
          const docsOf = Object.entries(docs as Record<string, Record<string, unknown>>)
            .filter(([, data]) => data[field] === value)
            .map(([id, data]) => ({ id, data: () => data }));
          return { docs: docsOf };
        },
      }),
      doc: (id: string) => ({
        get: async () => {
          reads.push(`${name}/${id}`);
          const data = docs[id];
          return { exists: data !== undefined, data: () => data };
        },
      }),
    })),
  } as unknown as Firestore;
  return { catalog: new FirestoreCheckpointCatalog(() => db, testEventResolver), reads };
}

describe("FirestoreCheckpointCatalog", () => {
  it("reads an active checkpoint", async () => {
    const { catalog, reads } = catalogWith({ "talk-1": { kind: "talk", active: true } });

    expect(await catalog.find("talk-1")).toEqual({ ok: true, value: { id: "talk-1", kind: "talk", name: "talk-1", active: true, description: "", image: null } });
    expect(reads).toEqual(["events/e1/checkpoints/talk-1"]);
  });

  it("reports an inactive checkpoint as such, and treats a missing flag as inactive", async () => {
    const { catalog } = catalogWith({ a1: { kind: "talk", active: false }, b1: { kind: "catering" } });

    expect(await catalog.find("a1")).toMatchObject({ ok: true, value: { active: false } });
    expect(await catalog.find("b1")).toMatchObject({ ok: true, value: { active: false } });
  });

  it("uses the name written on the checkpoint, and the id when there is none", async () => {
    const { catalog } = catalogWith({
      "talk-1": { kind: "talk", active: true, name: "  Keynote de apertura " },
      "talk-2": { kind: "talk", active: true, name: "   " },
      "talk-3": { kind: "talk", active: true, name: 42 },
    });

    expect(await catalog.find("talk-1")).toMatchObject({ value: { name: "Keynote de apertura" } });
    expect(await catalog.find("talk-2")).toMatchObject({ value: { name: "talk-2" } });
    expect(await catalog.find("talk-3")).toMatchObject({ value: { name: "talk-3" } });
  });

  it("reads a puesto's description and the address of its image, ignoring an image of another kind", async () => {
    const { catalog } = catalogWith({
      "louis-3d": { kind: "stand", active: true, description: "Impresión 3D", imagePath: "public/e1/checkpoint/abcdef123456.webp" },
      "odd-img": { kind: "stand", active: true, imagePath: "public/e1/mission/abcdef123456.webp" },
    });

    expect(await catalog.find("louis-3d")).toMatchObject({ ok: true, value: { description: "Impresión 3D", image: "/media/public/e1/checkpoint/abcdef123456.webp" } });
    expect(await catalog.find("odd-img")).toMatchObject({ ok: true, value: { description: "", image: null } });
  });

  it("returns null for a missing checkpoint", async () => {
    const { catalog } = catalogWith({});

    expect(await catalog.find("nope-1")).toEqual({ ok: true, value: null });
  });

  it("treats a document with an unknown kind as missing instead of guessing", async () => {
    const { catalog } = catalogWith({ "odd-1": { kind: "sponsor", active: true } });

    expect(await catalog.find("odd-1")).toEqual({ ok: true, value: null });
  });

  it("reads the checkpoints of the active edition only", async () => {
    const { reads } = catalogWith({});
    const db = {
      collection: withEventScope((name: string) => ({
        doc: (id: string) => ({
          get: async () => {
            reads.push(`${name}/${id}`);
            return { exists: false, data: () => undefined };
          },
        }),
      })),
    } as unknown as Firestore;

    await new FirestoreCheckpointCatalog(() => db, async () => "e7").find("talk-1");

    expect(reads).toEqual(["events/e7/checkpoints/talk-1"]);
  });

  it("lists the active checkpoints of the active edition, ordered by name", async () => {
    const { catalog, reads } = catalogWith({
      "talk-b": { kind: "talk", active: true, name: "Zeta" },
      "talk-a": { kind: "talk", active: true, name: "Alfa" },
      "lunch-1": { kind: "catering", active: true },
      "talk-off": { kind: "talk", active: false, name: "Cerrada" },
    });

    const result = await catalog.listActive();

    expect(result).toEqual({
      ok: true,
      value: [
        { id: "talk-a", kind: "talk", name: "Alfa", active: true, description: "", image: null },
        { id: "lunch-1", kind: "catering", name: "lunch-1", active: true, description: "", image: null },
        { id: "talk-b", kind: "talk", name: "Zeta", active: true, description: "", image: null },
      ],
    });
    expect(reads).toEqual(["events/e1/checkpoints?active==true"]);
  });

  it("skips malformed checkpoints when listing instead of guessing", async () => {
    const { catalog } = catalogWith({
      "talk-a": { kind: "talk", active: true },
      "odd-1": { kind: "sponsor", active: true },
      "Bad Id": { kind: "talk", active: true },
    });

    const result = await catalog.listActive();

    expect(result).toMatchObject({ ok: true, value: [{ id: "talk-a" }] });
  });

  it("reports a failed list as an unknown error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = new FirestoreCheckpointCatalog(() => {
      throw new Error("boom");
    }, testEventResolver);

    expect(await broken.listActive()).toEqual({ ok: false, error: { code: "unknown" } });
  });

  it("does not even query for a malformed id", async () => {
    const { catalog, reads } = catalogWith({});

    expect(await catalog.find("../users/u1")).toEqual({ ok: true, value: null });
    expect(reads).toEqual([]);
  });

  it("turns an unexpected failure into an unknown error", async () => {
    const catalog = new FirestoreCheckpointCatalog(() => {
      throw new Error("boom");
    }, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await catalog.find("talk-1")).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
