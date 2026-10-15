import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const media = vi.hoisted(() => ({ uploadImageAction: async () => ({ ok: false as const, code: "unknown" as const }) }));
vi.mock("@/app-shell/media/upload.action", () => media);
vi.mock("@/app-shell/composition/ranks.server", () => ({ rankDeps: { marker: "ranks" } }));
vi.mock("@/app-shell/ranks/ranks.actions", () => ({ saveRanksAction: async () => ({ ok: true }) }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { getRanksForEdit: vi.fn() };
vi.mock("@/features/attendee/server", () => server);

const { RanksEditor } = await import("@/features/attendee");
const { saveRanksAction } = await import("@/app-shell/ranks/ranks.actions");
const { default: AdminRanksPage } = await import("./page");

function findElement(node: ReactNode, type: unknown): { props: Record<string, unknown> } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as { type: unknown; props: Record<string, unknown> };
  if (element.type === type) return element;
  return findElement(element.props.children as ReactNode, type);
}

const RANKS = [{ id: "recruit", name: "Recluta", minXp: 0 }];

describe("admin ranks page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    server.getRanksForEdit.mockResolvedValue({ ok: true, value: { ranks: RANKS, isDefault: true } });
  });

  it("checks the admin role itself before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(AdminRanksPage()).rejects.toThrow("not-found");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(server.getRanksForEdit).not.toHaveBeenCalled();
  });

  it("opens the editor with the edition's ladder and the save action", async () => {
    const editor = findElement(await AdminRanksPage(), RanksEditor);

    expect(server.getRanksForEdit).toHaveBeenCalledWith({ marker: "ranks" }, { uid: "a1", role: "admin" });
    expect(editor?.props).toEqual({ ranks: RANKS, isDefault: true, save: saveRanksAction, upload: media.uploadImageAction });
  });

  it("surfaces a failed read through the error boundary", async () => {
    server.getRanksForEdit.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminRanksPage()).rejects.toThrow("Could not read the ranks");
  });
});
