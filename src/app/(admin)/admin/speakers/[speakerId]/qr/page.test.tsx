import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/speakers.server", () => ({ speakerAdminDeps: { marker: "speakers" } }));
vi.mock("@/app-shell/speakers/code.action", () => ({ issueSpeakerCodeAction: vi.fn() }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const permissions = vi.hoisted(() => ({ requireSection: vi.fn() }));
vi.mock("@/app-shell/permissions.server", () => permissions);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const server = vi.hoisted(() => ({ listManagedSpeakers: vi.fn() }));
vi.mock("@/features/speakers/server", () => server);

const { SpeakerCodeScreen } = await import("@/app-shell/speakers/SpeakerCodeScreen");
const { default: AdminSpeakerQrPage } = await import("./page");

function findElement(node: ReactNode, type: unknown): { props: Record<string, unknown> } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === type) return node as unknown as { props: Record<string, unknown> };
  return findElement((node.props as { children?: ReactNode }).children, type);
}

const ADMIN = { uid: "a1", role: "admin", displayName: null, photoUrl: null };
const speaker = (id: string, active = true) => ({ id, name: `Speaker ${id}`, headline: "", bio: "", photo: null, links: { linkedin: null, github: null, web: null }, active });
const page = (speakerId: string) => AdminSpeakerQrPage({ params: Promise.resolve({ speakerId }) });

describe("admin speaker code page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guards.requireRole.mockResolvedValue(ADMIN);
    server.listManagedSpeakers.mockResolvedValue({ ok: true, value: [speaker("ana-torres"), speaker("zoe", false)] });
  });

  it("shows an active speaker's code, for admins with the talks section", async () => {
    const screen = findElement(await page("ana-torres"), SpeakerCodeScreen);

    expect(permissions.requireSection).toHaveBeenCalledWith(ADMIN, "talks");
    expect(screen?.props).toEqual({ speakerId: "ana-torres", name: "Speaker ana-torres" });
  });

  it("is not found for an unknown or inactive speaker, and surfaces a failed read", async () => {
    await expect(page("ghost")).rejects.toBeInstanceOf(NotFound);
    await expect(page("zoe")).rejects.toBeInstanceOf(NotFound);

    server.listManagedSpeakers.mockResolvedValueOnce({ ok: false, error: { code: "unknown" } });
    await expect(page("ana-torres")).rejects.toThrow("Could not read the speakers");
  });
});
