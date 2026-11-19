// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { ImportTicketHoldersAction } from "./actions";
import { ImportTicketsView } from "./ImportTicketsView";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.admin.cadets.tickets;
const SUMMARY = { general: 205, pro: 4, premium: 26 };

function setup(extra: Partial<Parameters<typeof ImportTicketsView>[0]> = {}) {
  const importHolders = vi.fn<ImportTicketHoldersAction>(async () => ({ ok: true, total: 2, applied: 1, keptManual: 0, failed: 0, counts: { general: 1, pro: 0, premium: 1 } }));
  const view = render(<ImportTicketsView summary={SUMMARY} importHolders={importHolders} canEdit backHref="/admin/cadetes" {...extra} />);
  return { ...view, importHolders, user: userEvent.setup() };
}

const paste = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.click(screen.getByLabelText(t.pasteLabel));
  await user.paste(text);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ImportTicketsView", () => {
  it("shows what the loaded list holds, or that there is none", () => {
    const { unmount } = setup();
    expect(screen.getByText("235 correos en la lista")).toBeInTheDocument();
    expect(screen.getByText("Premium: 26")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.back })).toHaveAttribute("href", "/admin/cadetes");
    unmount();

    setup({ summary: null });
    expect(screen.getByText(t.summaryEmpty)).toBeInTheDocument();
  });

  it("previews the pasted list with its counts, the lines it cannot read and the repeated emails", async () => {
    const { user } = setup();

    await paste(user, "correo\tnombre\ttipo\nana@example.com\tAna\tPremium\nluis@example.com\tLuis\tPro\nmal-correo\tX\tPro\neva@example.com\tEva\tvip\nana@example.com\tAna\tGeneral");

    expect(await screen.findByText("2 filas válidas")).toBeInTheDocument();
    expect(screen.getByText("Línea 4: el correo «mal-correo» no es válido.")).toBeInTheDocument();
    expect(screen.getByText("Línea 5: «vip» no es una entrada. Usa General, Pro o Premium.")).toBeInTheDocument();
    expect(screen.getByText("ana@example.com (líneas 2, 6): con entradas distintas; se queda la más alta, Premium.")).toBeInTheDocument();
  });

  it("sends the valid rows, says what happened and refreshes", async () => {
    const importHolders = vi.fn<ImportTicketHoldersAction>(async () => ({ ok: true, total: 2, applied: 1, keptManual: 3, failed: 2, counts: { general: 1, pro: 0, premium: 1 } }));
    const { user } = setup({ importHolders });
    expect(screen.getByRole("button", { name: t.import })).toBeDisabled();

    await paste(user, "ana@example.com,Ana,premium\nluis@example.com,Luis,");
    await user.click(screen.getByRole("button", { name: t.import }));

    expect(importHolders).toHaveBeenCalledWith({
      rows: [
        { email: "ana@example.com", fullName: "Ana", type: "premium" },
        { email: "luis@example.com", fullName: "Luis", type: "general" },
      ],
    });
    expect(await screen.findByText("Lista importada: 2 correos. Se actualizó la entrada de 1 cadetes ya registrados.")).toBeInTheDocument();
    expect(screen.getByText("3 cadetes con entrada puesta a mano se quedaron como estaban.")).toBeInTheDocument();
    expect(screen.getByText("No se pudo revisar a 2 cuentas: vuelve a importar para reintentar.")).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows the server's reason when the import fails, and keeps the text", async () => {
    const importHolders = vi.fn<ImportTicketHoldersAction>(async () => ({ ok: false, code: "forbidden" }));
    const { user } = setup({ importHolders });

    await paste(user, "ana@example.com,Ana,premium");
    await user.click(screen.getByRole("button", { name: t.import }));

    expect(await screen.findByText(copy.tickets.errors.forbidden)).toBeInTheDocument();
    expect(screen.getByLabelText(t.pasteLabel)).toHaveValue("ana@example.com,Ana,premium");
  });

  it("reads a .csv file, with a byte order mark and semicolons", async () => {
    const { user } = setup();
    const file = new File(["﻿correo;nombre;tipo\r\nana@example.com;Ana;Pro\r\n"], "entradas.csv", { type: "text/csv" });

    await user.upload(screen.getByLabelText(t.fileLabel), file);

    expect(await screen.findByText("1 filas válidas")).toBeInTheDocument();
  });

  it("says so when nothing in the text can be imported", async () => {
    const { user } = setup();

    await paste(user, "solo texto");

    expect(await screen.findByText(t.previewNothing)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.import })).toBeDisabled();
  });

  it("only shows the list to a session that may not edit", () => {
    setup({ canEdit: false });

    expect(screen.queryByLabelText(t.pasteLabel)).not.toBeInTheDocument();
    expect(screen.getByText("235 correos en la lista")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container, user } = setup();
    await paste(user, "ana@example.com,Ana,premium\nmal");

    expect((await axe(container)).violations).toEqual([]);
  });
});
