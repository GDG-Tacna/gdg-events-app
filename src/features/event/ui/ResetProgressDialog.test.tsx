// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { ResetProgressAction } from "./actions";
import { ResetProgressDialog } from "./ResetProgressDialog";

const t = copy.admin.events.reset;
const TARGET = { id: "devfest-2026", name: "DevFest Tacna 2026" };

function setup(resetProgress: ResetProgressAction = vi.fn<ResetProgressAction>(async () => ({ ok: true, cadets: 120, documents: 840 })), target: typeof TARGET | null = TARGET) {
  const onDone = vi.fn();
  const onClose = vi.fn();
  render(<ResetProgressDialog target={target} resetProgress={resetProgress} onClose={onClose} onDone={onDone} />);
  return { resetProgress, onDone, onClose, user: userEvent.setup() };
}

describe("ResetProgressDialog", () => {
  it("explains what is cleared, what stays and that it cannot be undone, before anything happens", () => {
    const { resetProgress } = setup();
    const dialog = screen.getByRole("dialog", { name: t.title });

    expect(within(dialog).getByText("Vas a dejar en cero a todos los cadetes de «DevFest Tacna 2026». Úsalo, por ejemplo, para empezar el evento real después de las pruebas.")).toBeInTheDocument();
    for (const line of [...t.clears, ...t.stays]) expect(within(dialog).getByText(line)).toBeInTheDocument();
    expect(within(dialog).getByRole("note")).toHaveTextContent(t.warning);
    expect(resetProgress).not.toHaveBeenCalled();
  });

  it("cleans only when confirmed, with the edition's id, and says how many cadets start again", async () => {
    const { resetProgress, onDone, user } = setup();

    await user.click(screen.getByRole("button", { name: t.confirm }));

    await waitFor(() => expect(resetProgress).toHaveBeenCalledWith({ eventId: "devfest-2026" }));
    expect(onDone).toHaveBeenCalledWith("Listo: «DevFest Tacna 2026» está en cero. 120 cadetes empiezan de nuevo.");
  });

  it("does nothing when cancelled", async () => {
    const { resetProgress, onClose, user } = setup();

    await user.click(screen.getByRole("button", { name: t.cancel }));

    expect(resetProgress).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open with the server's reason when it refuses, and when the call itself fails", async () => {
    const refused = vi.fn<ResetProgressAction>().mockResolvedValueOnce({ ok: false, code: "finished" }).mockRejectedValueOnce(new Error("network"));
    const { onDone, user } = setup(refused);

    await user.click(screen.getByRole("button", { name: t.confirm }));
    expect(await screen.findByText(t.errors.finished)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.confirm }));
    expect(await screen.findByText(t.errors.unknown)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: t.title })).toBeInTheDocument();
  });

  it("is not shown without an edition", () => {
    setup(undefined, null);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    setup();
    expect((await axe(screen.getByRole("dialog"))).violations).toEqual([]);
  });
});
