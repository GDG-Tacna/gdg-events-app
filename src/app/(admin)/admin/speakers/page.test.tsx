import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/speakers.server", () => ({ speakerAdminDeps: { marker: "speakers" }, speakerAccessDeps: { marker: "access" } }));
vi.mock("@/app-shell/speakers/access.actions", () => ({ inviteSpeakerAction: vi.fn(), unlinkSpeakerAction: vi.fn() }));
vi.mock("@/app-shell/speakers/manage.actions", () => ({ createSpeakerAction: vi.fn(), updateSpeakerAction: vi.fn(), setSpeakerActiveAction: vi.fn() }));
vi.mock("@/app-shell/media/upload.action", () => ({ uploadImageAction: vi.fn() }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const permissions = vi.hoisted(() => ({ requireSection: vi.fn() }));
vi.mock("@/app-shell/permissions.server", () => permissions);

const server = vi.hoisted(() => ({ listManagedSpeakers: vi.fn(), listSpeakerAccess: vi.fn() }));
vi.mock("@/features/speakers/server", () => server);

const { SpeakersAdminView } = await import("@/features/speakers");
const actions = await import("@/app-shell/speakers/manage.actions");
const access = await import("@/app-shell/speakers/access.actions");
const { uploadImageAction } = await import("@/app-shell/media/upload.action");
const { default: AdminSpeakersPage } = await import("./page");

function findElement(node: ReactNode, type: unknown): { props: Record<string, unknown> } | null {
  if (!isValidElement(node)) return null;
  if (node.type === type) return node as unknown as { props: Record<string, unknown> };
  return findElement((node.props as { children?: ReactNode }).children, type);
}

const ADMIN = { uid: "a1", role: "admin", displayName: null, photoUrl: null };
const ANA = { id: "ana-torres", name: "Ana Torres", headline: "", bio: "", photo: null, links: { linkedin: null, github: null, web: null }, active: true };

describe("admin Speakers page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guards.requireRole.mockResolvedValue(ADMIN);
    server.listManagedSpeakers.mockResolvedValue({ ok: true, value: [ANA] });
    server.listSpeakerAccess.mockResolvedValue({ ok: true, value: { [ANA.id]: { state: "none" } } });
  });

  it("is for admins with the talks section, and hands the speakers and the actions to the screen", async () => {
    const view = findElement(await AdminSpeakersPage(), SpeakersAdminView);

    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(permissions.requireSection).toHaveBeenCalledWith(ADMIN, "talks");
    expect(server.listManagedSpeakers).toHaveBeenCalledWith({ marker: "speakers" }, { uid: "a1", role: "admin" });
    expect(view?.props).toEqual({
      speakers: [ANA],
      create: actions.createSpeakerAction,
      update: actions.updateSpeakerAction,
      setActive: actions.setSpeakerActiveAction,
      upload: uploadImageAction,
      qrBase: "/admin/speakers",
      access: { states: { [ANA.id]: { state: "none" } }, invite: access.inviteSpeakerAction, unlink: access.unlinkSpeakerAction },
    });
    expect(server.listSpeakerAccess).toHaveBeenCalledWith({ marker: "access" }, { uid: "a1", role: "admin" });
  });

  it("surfaces a failed read through the error boundary", async () => {
    server.listManagedSpeakers.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminSpeakersPage()).rejects.toThrow("Could not read the speakers");

    server.listManagedSpeakers.mockResolvedValue({ ok: true, value: [ANA] });
    server.listSpeakerAccess.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    await expect(AdminSpeakersPage()).rejects.toThrow("Could not read the speakers");
  });
});
