import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/speakers.server", () => ({ speakerAccessDeps: { marker: "access" } }));
vi.mock("@/app-shell/speakers/code.action", () => ({ issueSpeakerCodeAction: vi.fn() }));
const guards = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/app-shell/guards", () => guards);
const server = vi.hoisted(() => ({ speakerOfAccount: vi.fn() }));
vi.mock("@/features/speakers/server", () => server);

const { SpeakerCodeScreen } = await import("@/app-shell/speakers/SpeakerCodeScreen");
const { copy } = await import("@/shared/copy/es");
const { default: SpeakerHomePage } = await import("./page");

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

function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!isValidElement(node)) return "";
  return textOf((node.props as { children?: ReactNode }).children);
}

describe("speaker's own code page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireSession.mockResolvedValue({ uid: "a1", role: null });
  });

  it("shows the code of the speaker linked to the account, cadet or not", async () => {
    server.speakerOfAccount.mockResolvedValue({ ok: true, value: { id: "ana-torres", name: "Ana Torres", active: true } });

    const screen = findElement(await SpeakerHomePage(), SpeakerCodeScreen);

    expect(server.speakerOfAccount).toHaveBeenCalledWith({ marker: "access" }, "a1");
    expect(screen?.props).toEqual({ speakerId: "ana-torres", name: "Ana Torres" });
  });

  it("explains when the account holds no speaker, or an inactive one", async () => {
    server.speakerOfAccount.mockResolvedValue({ ok: true, value: null });
    const none = await SpeakerHomePage();
    expect(findElement(none, SpeakerCodeScreen)).toBeNull();
    expect(textOf(none)).toContain(copy.speakerHome.none);

    server.speakerOfAccount.mockResolvedValue({ ok: true, value: { id: "ana-torres", name: "Ana Torres", active: false } });
    expect(textOf(await SpeakerHomePage())).toContain(copy.speakerHome.inactive);
  });

  it("surfaces a failed read", async () => {
    server.speakerOfAccount.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(SpeakerHomePage()).rejects.toThrow("Could not read the speakers");
  });
});
