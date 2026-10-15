// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axe } from "@/test-utils/axe";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { SortableList } from "./SortableList";

const ITEMS = [
  { id: "aa", name: "Alfa" },
  { id: "bb", name: "Beta" },
  { id: "cc", name: "Gama" },
];
type Item = (typeof ITEMS)[number];

function setup({ onMove = vi.fn(async () => true), items = ITEMS, disabled = false }: { onMove?: (id: string, to: number) => Promise<boolean>; items?: Item[]; disabled?: boolean } = {}) {
  const view = (list: Item[]) => (
    <SortableList
      items={list}
      getId={(item) => item.id}
      getLabel={(item) => item.name}
      onMove={onMove}
      label="Orden"
      disabled={disabled}
      renderItem={(item, handle) => (
        <div>
          {handle}
          <span>{item.name}</span>
        </div>
      )}
    />
  );
  const utils = render(view(items));
  return { ...utils, onMove, rerenderWith: (list: Item[]) => utils.rerender(view(list)) };
}

const names = () => within(screen.getByRole("list", { name: "Orden" })).getAllByRole("listitem").map((row) => row.textContent);
const handle = (name: string) => screen.getByRole("button", { name: `Mover ${name}` });

describe("SortableList", () => {
  it("moves a row with the arrow keys, keeps the focus on its handle and says where it landed", async () => {
    const { onMove } = setup();

    handle("Alfa").focus();
    fireEvent.keyDown(handle("Alfa"), { key: "ArrowDown" });

    expect(names()).toEqual(["Beta", "Alfa", "Gama"]);
    expect(onMove).toHaveBeenCalledWith("aa", 1);
    await waitFor(() => expect(handle("Alfa")).toHaveFocus());
    expect(screen.getByText("Alfa: posición 2 de 3.")).toBeInTheDocument();
  });

  it("takes Home and End to the ends, and ignores a move past them", async () => {
    const { onMove } = setup();

    fireEvent.keyDown(handle("Alfa"), { key: "End" });
    expect(names()).toEqual(["Beta", "Gama", "Alfa"]);
    expect(onMove).toHaveBeenLastCalledWith("aa", 2);

    fireEvent.keyDown(handle("Alfa"), { key: "Home" });
    expect(names()).toEqual(["Alfa", "Beta", "Gama"]);
    expect(onMove).toHaveBeenLastCalledWith("aa", 0);

    fireEvent.keyDown(handle("Alfa"), { key: "ArrowUp" });
    fireEvent.keyDown(handle("Alfa"), { key: "a" });
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it("puts the list back when the move is refused", async () => {
    setup({ onMove: vi.fn(async () => false) });

    fireEvent.keyDown(handle("Gama"), { key: "ArrowUp" });
    expect(names()).toEqual(["Alfa", "Gama", "Beta"]);

    await waitFor(() => expect(names()).toEqual(["Alfa", "Beta", "Gama"]));
  });

  it("follows the server's order when it changes", () => {
    const { rerenderWith } = setup();

    act(() => rerenderWith([ITEMS[2], ITEMS[0], ITEMS[1], { id: "dd", name: "Delta" }]));

    expect(names()).toEqual(["Gama", "Alfa", "Beta", "Delta"]);
  });

  it("disables the handles while something else is saving", () => {
    const { onMove } = setup({ disabled: true });

    // aria-disabled, not disabled: the handle keeps the focus while a move is saved.
    expect(handle("Alfa")).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(handle("Alfa"), { key: "ArrowDown" });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("explains how to move with the keyboard and has no accessibility violations", async () => {
    const { container } = setup();

    expect(handle("Beta")).toHaveAccessibleDescription(copy.common.sortable.hint);
    expect((await axe(container)).violations).toEqual([]);
  });
});
