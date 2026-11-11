// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { ConfirmDialog, useConfirm, type ConfirmOptions } from "./ConfirmDialog";

const OPTIONS: ConfirmOptions = { title: "¿Eliminar la misión «X»?", description: "Se borra para siempre.", confirmLabel: "Eliminar" };

describe("ConfirmDialog", () => {
  it("asks with a title, what happens and two buttons, and answers true when confirmed", async () => {
    const onAnswer = vi.fn();
    render(<ConfirmDialog open options={OPTIONS} onAnswer={onAnswer} />);

    const dialog = screen.getByRole("dialog", { name: OPTIONS.title });
    expect(dialog).toHaveAccessibleDescription(OPTIONS.description);
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("answers false when cancelled, on Escape, and for any other way of closing it", async () => {
    const onAnswer = vi.fn();
    render(<ConfirmDialog open options={{ ...OPTIONS, cancelLabel: "Mejor no" }} onAnswer={onAnswer} />);

    await userEvent.click(screen.getByRole("button", { name: "Mejor no" }));
    await userEvent.keyboard("{Escape}");

    expect(onAnswer).toHaveBeenCalledTimes(2);
    expect(onAnswer).toHaveBeenNthCalledWith(1, false);
    expect(onAnswer).toHaveBeenNthCalledWith(2, false);
  });

  it("says «Cancelar» unless told otherwise", () => {
    render(<ConfirmDialog open options={OPTIONS} onAnswer={vi.fn()} />);

    expect(screen.getByRole("button", { name: copy.common.cancel })).toBeInTheDocument();
  });

  it("puts the focus on the safe button when the action is dangerous, and on the confirm button when it is not", () => {
    const { unmount } = render(<ConfirmDialog open options={OPTIONS} onAnswer={vi.fn()} />);
    expect(screen.getByRole("button", { name: copy.common.cancel })).toHaveFocus();
    unmount();

    render(<ConfirmDialog open options={{ ...OPTIONS, tone: "default" }} onAnswer={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveFocus();
  });

  it("renders nothing while closed, and has no detectable accessibility violations when open", async () => {
    const { unmount } = render(<ConfirmDialog open={false} options={OPTIONS} onAnswer={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmount();

    render(<ConfirmDialog open options={OPTIONS} onAnswer={vi.fn()} />);
    expect((await axe(document.body)).violations).toEqual([]);
  });
});

function Probe({ onResult }: { onResult: (confirmed: boolean) => void }) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button type="button" onClick={async () => onResult(await confirm(OPTIONS))}>
        Preguntar
      </button>
      <button type="button" onClick={() => void confirm({ ...OPTIONS, title: "Otra pregunta" })}>
        Preguntar otra
      </button>
      {dialog}
    </>
  );
}

describe("useConfirm", () => {
  it("shows nothing until asked, then resolves true when confirmed and closes", async () => {
    const onResult = vi.fn();
    render(<Probe onResult={onResult} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(screen.getByRole("dialog", { name: OPTIONS.title })).toBeInTheDocument();
    expect(onResult).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledExactlyOnceWith(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("resolves false when cancelled", async () => {
    const onResult = vi.fn();
    render(<Probe onResult={onResult} />);

    await userEvent.click(screen.getByRole("button", { name: "Preguntar" }));
    await userEvent.click(screen.getByRole("button", { name: copy.common.cancel }));

    await waitFor(() => expect(onResult).toHaveBeenCalledExactlyOnceWith(false));
  });

  it("can ask again after answering", async () => {
    const onResult = vi.fn();
    render(<Probe onResult={onResult} />);

    await userEvent.click(screen.getByRole("button", { name: "Preguntar" }));
    await userEvent.click(screen.getByRole("button", { name: copy.common.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Preguntar" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(onResult).toHaveBeenNthCalledWith(2, true));
  });
});
