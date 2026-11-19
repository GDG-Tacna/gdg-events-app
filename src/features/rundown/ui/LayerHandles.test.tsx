// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { LayerHandles, type LayerHandlesProps } from "./LayerHandles";

const t = copy.stageConsole.layers;

function setup(props: Partial<LayerHandlesProps> = {}) {
  const onMove = vi.fn();
  const onMoveEnd = vi.fn();
  const view = render(
    <div data-testid="screen" style={{ position: "relative", width: 400, height: 225 }}>
      <LayerHandles counter={{ x: 50, y: 50, size: "sm" }} cards={[{ id: "card-0001", title: "Luis", x: 10, y: 80 }]} onMove={onMove} onMoveEnd={onMoveEnd} {...props} />
    </div>,
  );
  // jsdom has no layout: the small screen is 400 x 225 for the drag maths.
  const area = view.getByTestId("screen").firstElementChild as HTMLElement;
  area.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 225, width: 400, height: 225, toJSON: () => ({}) });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => undefined });
  return { onMove, onMoveEnd };
}

describe("LayerHandles", () => {
  it("has a frame for the counter and one for each card that is on the screen, each at its place", () => {
    setup();

    const counter = screen.getByRole("button", { name: t.moveCounter });
    expect(counter).toHaveStyle({ left: "50%", top: "50%" });
    expect(screen.getByRole("button", { name: "Mover la tarjeta Luis" })).toHaveStyle({ left: "10%", top: "80%" });
  });

  it("has no frame for a big counter (it fills the screen) or when nothing is shown", () => {
    setup({ counter: { x: 50, y: 50, size: "lg" }, cards: [] });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("moves the layer with the pointer by the distance dragged, scaled to the screen it hangs from, and says when the drag ends", () => {
    const { onMove, onMoveEnd } = setup();
    const counter = screen.getByRole("button", { name: t.moveCounter });

    fireEvent.pointerDown(counter, { pointerId: 1, clientX: 100, clientY: 100 });
    // 40 px of 400 is 10% of the screen; a layer 15% wide hangs from its corner, so the place moves by 10 / 0.85.
    fireEvent.pointerMove(counter, { pointerId: 1, clientX: 140, clientY: 100 });
    expect(onMove).toHaveBeenLastCalledWith({ type: "counter" }, { x: 61.8, y: 50 });
    fireEvent.pointerUp(counter, { pointerId: 1 });
    expect(onMoveEnd).toHaveBeenCalledWith({ type: "counter" });
  });

  it("keeps the place inside the screen however far it is dragged", () => {
    const { onMove } = setup();
    const card = screen.getByRole("button", { name: "Mover la tarjeta Luis" });

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 5000, clientY: -5000 });
    expect(onMove).toHaveBeenLastCalledWith({ type: "card", id: "card-0001" }, { x: 100, y: 0 });
  });

  it("does nothing on a move without a press first, and a release without a drag ends nothing", () => {
    const { onMove, onMoveEnd } = setup();
    const counter = screen.getByRole("button", { name: t.moveCounter });

    fireEvent.pointerMove(counter, { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(counter, { pointerId: 1 });
    expect(onMove).not.toHaveBeenCalled();
    expect(onMoveEnd).not.toHaveBeenCalled();
  });

  it("moves with the arrow keys, two at a time and ten with Shift, and says it each time", () => {
    const { onMove, onMoveEnd } = setup();
    const counter = screen.getByRole("button", { name: t.moveCounter });

    fireEvent.keyDown(counter, { key: "ArrowRight" });
    expect(onMove).toHaveBeenLastCalledWith({ type: "counter" }, { x: 52, y: 50 });
    fireEvent.keyDown(counter, { key: "ArrowUp", shiftKey: true });
    expect(onMove).toHaveBeenLastCalledWith({ type: "counter" }, { x: 50, y: 40 });
    fireEvent.keyDown(counter, { key: "a" });
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(onMoveEnd).toHaveBeenCalledTimes(2);
  });
});
