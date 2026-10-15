// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { RouteModal } from "./RouteModal";

const router = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("RouteModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens at once as a dialog named by its title, with the screen inside", () => {
    render(
      <RouteModal title="Editar misión">
        <h1>Editar misión</h1>
        <p>Formulario</p>
      </RouteModal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Editar misión" });
    expect(dialog).toHaveTextContent("Formulario");
  });

  it("goes back to the list underneath when closed with its button or with Escape", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<RouteModal title="Editar">x</RouteModal>);

    await user.click(screen.getByRole("button", { name: copy.common.close }));
    expect(router.back).toHaveBeenCalledTimes(1);
    unmount();

    render(<RouteModal title="Editar">x</RouteModal>);
    await user.keyboard("{Escape}");
    expect(router.back).toHaveBeenCalledTimes(2);
  });

  it("has no detectable accessibility violations", async () => {
    render(
      <RouteModal title="Editar misión">
        <h1>Editar misión</h1>
      </RouteModal>,
    );

    expect((await axe(screen.getByRole("dialog"))).violations).toEqual([]);
  });
});
