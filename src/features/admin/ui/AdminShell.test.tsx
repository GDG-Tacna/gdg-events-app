// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { AdminShell, type AdminNavItem } from "./AdminShell";

const navigation = vi.hoisted(() => ({ pathname: "/admin" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "Inicio", exact: true },
  { href: "/admin/team", label: "Equipo" },
];

const renderShell = () =>
  render(
    <AdminShell items={ITEMS} account="Ana Pérez" accountActions={<button type="button">Salir</button>}>
      <h1>Contenido</h1>
    </AdminShell>,
  );

describe("AdminShell", () => {
  beforeEach(() => {
    navigation.pathname = "/admin";
  });

  it("frames the content with the brand, the navigation and the account", () => {
    renderShell();

    expect(screen.getByRole("heading", { name: "Contenido" })).toBeInTheDocument();
    expect(screen.getByText(copy.admin.brand)).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: copy.admin.navLabel });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/admin", "/admin/team"]);
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
  });

  it("marks only the home item as current on the home page, even though /admin/team starts with /admin", () => {
    renderShell();

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Equipo" })).not.toHaveAttribute("aria-current");
  });

  it("marks a section as current on its page and on the pages below it", () => {
    navigation.pathname = "/admin/team";
    const { rerender } = renderShell();
    expect(screen.getByRole("link", { name: "Equipo" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");

    navigation.pathname = "/admin/team/someone";
    rerender(
      <AdminShell items={ITEMS} account="Ana">
        <p>x</p>
      </AdminShell>,
    );
    expect(screen.getByRole("link", { name: "Equipo" })).toHaveAttribute("aria-current", "page");
  });

  it("does not match a section by a shared name prefix (/admin/teamwork is not Equipo)", () => {
    navigation.pathname = "/admin/teamwork";
    renderShell();

    expect(screen.getByRole("link", { name: "Equipo" })).not.toHaveAttribute("aria-current");
  });

  it("copes with a missing pathname (it is null outside the router)", () => {
    navigation.pathname = null;
    renderShell();

    expect(screen.queryByRole("link", { current: "page" })).not.toBeInTheDocument();
  });

  it("shows a view-only area with every control switched off and a note, and other areas as usual", () => {
    navigation.pathname = "/admin/team/nuevo";
    const { unmount } = render(
      <AdminShell items={ITEMS} account="Ana" readOnly={["/admin/team"]}>
        <button type="button">Guardar</button>
        <Link href="/admin/team/x">Ver detalle</Link>
      </AdminShell>,
    );

    expect(screen.getByRole("note")).toHaveTextContent(copy.admin.viewOnly);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Ver detalle" })).toHaveAttribute("href", "/admin/team/x");
    unmount();

    navigation.pathname = "/admin";
    render(
      <AdminShell items={ITEMS} account="Ana" readOnly={["/admin/team"]}>
        <button type="button">Guardar</button>
      </AdminShell>,
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("shows the account's photo, or its initial, and a compact sign out at the top for phones", () => {
    const { container, unmount } = render(
      <AdminShell items={ITEMS} account="Ana Pérez" accountPhotoUrl="https://lh3.googleusercontent.com/a/ana" compactAccountActions={<button type="button">Salir arriba</button>}>
        <p>x</p>
      </AdminShell>,
    );

    const photos = container.querySelectorAll('img[src="https://lh3.googleusercontent.com/a/ana"]');
    expect(photos.length).toBeGreaterThan(0);
    photos.forEach((photo) => expect(photo).toHaveAttribute("alt", ""));
    expect(screen.getByRole("button", { name: "Salir arriba" })).toBeInTheDocument();
    unmount();

    render(
      <AdminShell items={ITEMS} account="Ana Pérez">
        <p>x</p>
      </AdminShell>,
    );
    expect(screen.getAllByText("A").length).toBeGreaterThan(0);
  });

  it("shows the menu in its groups, each one foldable, and a phone button that names the current area and opens it", async () => {
    navigation.pathname = "/admin/charlas";
    render(
      <AdminShell
        items={[
          { href: "/admin", label: "Inicio", exact: true },
          { href: "/admin/eventos", label: "Eventos", group: "Evento" },
          { href: "/admin/charlas", label: "Charlas", group: "Programa" },
          { href: "/admin/puestos", label: "Puestos", group: "Programa" },
        ]}
        account="Ana"
      >
        <p>x</p>
      </AdminShell>,
    );

    const nav = screen.getByRole("navigation", { name: copy.admin.navLabel });
    expect(within(nav).getByText("Evento").closest("details")).toHaveAttribute("open");
    expect(within(nav).getByText("Programa").closest("details")).toContainElement(within(nav).getByRole("link", { name: "Puestos" }));

    const button = within(nav).getByRole("button", { name: "Menú · Charlas" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.setup().click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderShell();

    expect((await axe(container)).violations).toEqual([]);
  });
});
