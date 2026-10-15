import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const composition = vi.hoisted(() => ({ talkAdminDeps: { marker: "talks" }, talkRooms: vi.fn() }));
vi.mock("@/app-shell/composition/talks.server", () => composition);
vi.mock("@/app-shell/talks/manage.actions", () => ({ createTalkAction: vi.fn(), updateTalkAction: vi.fn(), setTalkActiveAction: vi.fn() }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const server = vi.hoisted(() => ({ listManagedTalks: vi.fn() }));
vi.mock("@/features/talks/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/talks/server")>()), listManagedTalks: server.listManagedTalks }));

const { TalkForm, TalksAdminView } = await import("@/features/talks");
const actions = await import("@/app-shell/talks/manage.actions");
const { default: AdminTalksPage } = await import("./page");
const { default: AdminNewTalkPage } = await import("./nueva/page");
const { default: AdminEditTalkPage } = await import("./[talkId]/page");

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

const ROOMS = [{ id: "auditorio", name: "Auditorio" }];
const KEYNOTE = {
  id: "keynote",
  title: "Keynote",
  speaker: "Ana",
  startsAt: new Date("2026-10-24T14:00:00Z"),
  endsAt: new Date("2026-10-24T14:45:00Z"),
  roomId: "auditorio",
  description: "",
  active: true,
};

describe("admin Charlas pages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    composition.talkRooms.mockResolvedValue(ROOMS);
    server.listManagedTalks.mockResolvedValue({ ok: true, value: [KEYNOTE, { ...KEYNOTE, id: "cerrada", active: false }] });
  });

  it("lists the talks as plain data with the venue's times, and the links to create, edit and project", async () => {
    const view = findElement(await AdminTalksPage(), TalksAdminView);

    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(server.listManagedTalks).toHaveBeenCalledWith({ marker: "talks" }, { uid: "a1", role: "admin" });
    expect((view?.props.talks as Array<{ startsAt: string; endsAt: string }>)[0]).toMatchObject({ id: "keynote", startsAt: "2026-10-24T09:00", endsAt: "2026-10-24T09:45" });
    expect(view?.props).toMatchObject({ rooms: ROOMS, setActive: actions.setTalkActiveAction, hrefs: { create: "/admin/charlas/nueva", editBase: "/admin/charlas", projectBase: "/admin/qr" } });
  });

  it("surfaces a failed read through the error boundary", async () => {
    server.listManagedTalks.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminTalksPage()).rejects.toThrow("Could not read the talks");
  });

  it("offers the create form with the rooms", async () => {
    const form = findElement(await AdminNewTalkPage(), TalkForm);

    expect(form?.props).toMatchObject({ mode: "create", save: actions.createTalkAction, rooms: ROOMS, listHref: "/admin/charlas" });
  });

  it("edits a talk, offering its QR only while it is open", async () => {
    const open = findElement(await AdminEditTalkPage({ params: Promise.resolve({ talkId: "keynote" }) } as never), TalkForm);
    expect(open?.props).toMatchObject({ mode: "edit", save: actions.updateTalkAction, qrHref: "/admin/qr/keynote", talk: { id: "keynote", startsAt: "2026-10-24T09:00" } });

    const closed = findElement(await AdminEditTalkPage({ params: Promise.resolve({ talkId: "cerrada" }) } as never), TalkForm);
    expect(closed?.props.qrHref).toBeUndefined();
  });

  it("is not found for an unknown talk", async () => {
    await expect(AdminEditTalkPage({ params: Promise.resolve({ talkId: "nope" }) } as never)).rejects.toBeInstanceOf(NotFound);
  });
});
