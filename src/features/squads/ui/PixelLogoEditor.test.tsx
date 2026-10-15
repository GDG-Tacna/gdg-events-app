// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import type { PixelSpriteData } from "@/shared/types/pixel";
import { axe } from "@/test-utils/axe";
import { PixelLogoEditor, blankLogo } from "./PixelLogoEditor";

/** The editor is controlled: this keeps its value like a form would, and exposes the latest one. */
function Harness({ initial = blankLogo(), onValue }: { initial?: PixelSpriteData; onValue?: (value: PixelSpriteData) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <PixelLogoEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

const grid = () => screen.getByRole("grid", { name: copy.admin.squads.editor.gridLabel });
const cell = (row: number, column: number) => document.querySelector(`[data-cell="${column}-${row}"]`) as HTMLElement;

/** jsdom has no layout: give the grid a size so pointer positions map to cells (20 px per cell). */
function sizeGrid() {
  grid().getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 320, right: 320, bottom: 320, x: 0, y: 0, toJSON: () => ({}) });
}

describe("PixelLogoEditor", () => {
  it("draws a 16 by 16 canvas, every cell described for assistive tech", () => {
    render(<Harness />);

    expect(screen.getAllByRole("gridcell")).toHaveLength(256);
    expect(screen.getAllByRole("row")).toHaveLength(16);
    expect(cell(0, 0)).toHaveAttribute("aria-label", "Fila 1, columna 1: vacío");
  });

  it("paints the cell under the pointer with the chosen color, and keeps painting while dragging", () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    sizeGrid();

    fireEvent.pointerDown(grid(), { clientX: 30, clientY: 10, pointerId: 1 }); // row 1, column 2
    fireEvent.pointerMove(grid(), { clientX: 50, clientY: 10, pointerId: 1 }); // row 1, column 3
    fireEvent.pointerUp(grid(), { pointerId: 1 });
    fireEvent.pointerMove(grid(), { clientX: 70, clientY: 10, pointerId: 1 }); // released: no paint

    const last = onValue.mock.calls.at(-1)![0] as PixelSpriteData;
    expect(last.rows[0]).toBe(".aa.............");
    expect(cell(0, 1)).toHaveAttribute("aria-label", "Fila 1, columna 2: Color 1");
  });

  it("erases with the eraser", () => {
    const initial = blankLogo();
    const onValue = vi.fn();
    render(<Harness initial={{ ...initial, rows: ["a".repeat(16), ...initial.rows.slice(1)] }} onValue={onValue} />);
    sizeGrid();

    fireEvent.click(screen.getByRole("radio", { name: copy.admin.squads.editor.eraser }));
    fireEvent.pointerDown(grid(), { clientX: 10, clientY: 10, pointerId: 1 });

    expect((onValue.mock.calls.at(-1)![0] as PixelSpriteData).rows[0]).toBe(".aaaaaaaaaaaaaaa");
  });

  it("works from the keyboard: arrows move over the grid and Space paints", () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    cell(0, 0).focus();
    fireEvent.keyDown(cell(0, 0), { key: "ArrowRight" });
    fireEvent.keyDown(cell(0, 1), { key: "ArrowDown" });
    expect(cell(1, 1)).toHaveFocus();
    fireEvent.keyDown(cell(1, 1), { key: " " });

    expect((onValue.mock.calls.at(-1)![0] as PixelSpriteData).rows[1]).toBe(".a..............");
  });

  it("keeps the cursor inside the grid", () => {
    render(<Harness />);

    cell(0, 0).focus();
    fireEvent.keyDown(cell(0, 0), { key: "ArrowUp" });
    fireEvent.keyDown(cell(0, 0), { key: "ArrowLeft" });

    expect(cell(0, 0)).toHaveFocus();
  });

  it("adds colors up to eight, each one editable, and paints with the one chosen", () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    sizeGrid();
    const add = screen.getByRole("button", { name: copy.admin.squads.editor.addColor });

    fireEvent.click(add);
    expect(screen.getByRole("radio", { name: "Color 2" })).toHaveAttribute("aria-checked", "true");
    fireEvent.change(screen.getByLabelText("Cambiar el color 2"), { target: { value: "#123456" } });
    fireEvent.pointerDown(grid(), { clientX: 10, clientY: 10, pointerId: 1 });

    const last = onValue.mock.calls.at(-1)![0] as PixelSpriteData;
    expect(last.palette.b).toBe("#123456");
    expect(last.rows[0][0]).toBe("b");

    for (let added = 2; added < 8; added += 1) fireEvent.click(add);
    expect(screen.getAllByRole("radio")).toHaveLength(9); // 8 colors and the eraser
    expect(add).toBeDisabled();
  });

  it("clears the canvas but keeps the palette", () => {
    const onValue = vi.fn();
    const initial = blankLogo();
    render(<Harness initial={{ ...initial, rows: ["a".repeat(16), ...initial.rows.slice(1)] }} onValue={onValue} />);

    fireEvent.click(screen.getByRole("button", { name: copy.admin.squads.editor.clear }));

    const last = onValue.mock.calls.at(-1)![0] as PixelSpriteData;
    expect(last.rows.every((row) => row === ".".repeat(16))).toBe(true);
    expect(last.palette).toEqual(initial.palette);
  });

  it("numbers colors by their place in the palette, whatever letters the logo uses (the original logos use their own)", () => {
    const rows = Array.from({ length: 16 }, (_, y) => (y === 0 ? "xy.............." : "................"));
    render(<Harness initial={{ rows, palette: { x: "#ff0000", y: "#00ff00" } }} />);

    expect(cell(0, 0)).toHaveAttribute("aria-label", "Fila 1, columna 1: Color 1");
    expect(cell(0, 1)).toHaveAttribute("aria-label", "Fila 1, columna 2: Color 2");
    expect(screen.getByRole("radio", { name: "Color 2" })).toBeInTheDocument();
    expect(screen.getByLabelText("Cambiar el color 1")).toHaveValue("#ff0000");
  });

  it("does not paint while disabled", () => {
    const onChange = vi.fn();
    render(<PixelLogoEditor value={blankLogo()} onChange={onChange} disabled />);
    sizeGrid();

    fireEvent.pointerDown(grid(), { clientX: 10, clientY: 10, pointerId: 1 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<Harness />);

    expect((await axe(container)).violations).toEqual([]);
  });
});
