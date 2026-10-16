import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
  usePathname: () => "/admin",
}));

const switcher = vi.hoisted(() => ({ loadEditionSwitch: vi.fn() }));
vi.mock("@/app-shell/event/working-edition.server", () => switcher);
vi.mock("@/app-shell/event/working-edition.actions", () => ({ chooseWorkingEditionAction: async () => ({ ok: true }) }));

const MODULES_ON = { squads: true, map: true, missions: true, odyssey: true, achievements: true, minigames: true, network: true, leaderboard: true, raffle: true };
const features = vi.hoisted(() => ({ FEATURES: { admin: true } as Record<string, boolean> }));
vi.mock("@/shared/config/features", () => features);

const { AdminShell } = await import("@/features/admin");
const { SignOutButton } = await import("@/features/auth");
const { EditionSwitcher, WorkingEditionNotice } = await import("@/features/event");
const { chooseWorkingEditionAction } = await import("@/app-shell/event/working-edition.actions");
const { default: AdminLayout, metadata } = await import("./layout");

const props = (children: ReactNode, modal: ReactNode = null) => ({ children, modal }) as unknown as Parameters<typeof AdminLayout>[0];

describe("admin layout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(features.FEATURES, { admin: true, ...MODULES_ON });
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: "Ana", photoUrl: null });
    switcher.loadEditionSwitch.mockResolvedValue(null);
  });

  it("leaves out the areas of modules the edition has off", async () => {
    features.FEATURES.raffle = false;
    features.FEATURES.missions = false;

    const tree = (await AdminLayout(props(<p>x</p>))) as { props: { items: Array<{ href: string }> } };
    const hrefs = tree.props.items.map((item) => item.href);

    expect(hrefs).not.toContain("/admin/sorteo");
    expect(hrefs).not.toContain("/admin/misiones");
    expect(hrefs).toContain("/admin/puestos");
  });

  it("puts the edition picker under the brand and the notice above the page, for the session's editions", async () => {
    const live = { id: "devfest-2026", name: "DevFest", isPublic: true, stage: "live" };
    const draft = { id: "meetup-nov", name: "Meetup", isPublic: false, stage: "draft" };
    switcher.loadEditionSwitch.mockResolvedValue({ choices: [live, draft], current: draft });

    const tree = (await AdminLayout(props(<p>x</p>))) as { props: { edition: { type: unknown; props: unknown }; notice: { type: unknown; props: unknown } } };

    expect(switcher.loadEditionSwitch).toHaveBeenCalledWith(expect.objectContaining({ uid: "a1" }));
    expect(tree.props.edition.type).toBe(EditionSwitcher);
    expect(tree.props.edition.props).toEqual({ choices: [live, draft], current: draft, choose: chooseWorkingEditionAction });
    expect(tree.props.notice.type).toBe(WorkingEditionNotice);
    expect(tree.props.notice.props).toEqual({ current: draft, live, choose: chooseWorkingEditionAction });
  });

  it("requires the admin role: visitors, users without a role and non-admins are all stopped by the guard", async () => {
    await AdminLayout(props(<p>x</p>));

    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
  });

  it("lets the guard's redirect or not-found reach the router untouched", async () => {
    guards.requireRole.mockRejectedValue(new NotFound("forbidden"));

    await expect(AdminLayout(props(<p>x</p>))).rejects.toBeInstanceOf(NotFound);
  });

  it("is not found at all when the admin area is switched off, without even reading the session", async () => {
    features.FEATURES.admin = false;

    await expect(AdminLayout(props(<p>x</p>))).rejects.toBeInstanceOf(NotFound);
    expect(guards.requireRole).not.toHaveBeenCalled();
  });

  it("frames the page with the navigation, the admin's name and the sign-out control", async () => {
    const child = <p>contenido</p>;

    const tree = await AdminLayout(props(child));

    expect(isValidElement(tree) && tree.type === AdminShell).toBe(true);
    const shell = tree as unknown as { props: Record<string, unknown> };
    expect(shell.props.account).toBe("Ana");
    expect((shell.props.items as Array<{ href: string }>).map((item) => item.href)).toEqual([
      "/admin",
      "/admin/eventos",
      "/admin/team",
      "/admin/charlas",
      "/admin/speakers",
      "/admin/puestos",
      "/admin/zonas",
      "/admin/mapa",
      "/admin/misiones",
      "/admin/odisea",
      "/admin/minijuegos",
      "/admin/logros",
      "/admin/rangos",
      "/admin/escuadrones",
      "/admin/creditos-escuadron",
      "/admin/economia",
      "/admin/sorteo",
      "/admin/escenario",
    ]);
    expect((shell.props.accountActions as { type: unknown }).type).toBe(SignOutButton);
    const compact = shell.props.compactAccountActions as { type: unknown; props: { variant?: string } };
    expect(compact.type).toBe(SignOutButton);
    expect(compact.props.variant).toBe("icon");
    expect(shell.props.accountPhotoUrl).toBeNull();
    expect((shell.props.children as ReactNode[])[0]).toBe(child);
  });

  it("is never indexed by search engines", () => {
    expect(metadata.robots).toEqual({ index: false });
  });

  it("shows the page and, after it, a create or edit screen opened in a modal", async () => {
    const page = <p>lista</p>;
    const modal = <div role="dialog">formulario</div>;

    const tree = (await AdminLayout(props(page, modal))) as unknown as { props: { children: ReactNode[] } };

    expect(tree.props.children).toEqual([page, modal]);
  });
});
