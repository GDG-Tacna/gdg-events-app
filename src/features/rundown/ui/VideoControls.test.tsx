// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { VideoControls, formatClock, type VideoControlsProps } from "./VideoControls";

const t = copy.stageConsole.video;

function setup(props: Partial<VideoControlsProps> = {}) {
  const handlers = { onRestart: vi.fn(), onToggleLoop: vi.fn(), onToggleMute: vi.fn(), onVolume: vi.fn(), onSeek: vi.fn() };
  const view = render(<VideoControls loop={false} muted={false} volume={1} progress={{ time: 65, duration: 125 }} {...handlers} {...props} />);
  return { ...handlers, ...view };
}

describe("formatClock", () => {
  it("writes minutes and seconds, and hours when there are any", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65.9)).toBe("1:05");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-4)).toBe("0:00");
  });
});

describe("VideoControls", () => {
  it("shows where the video is and lets the operator jump to another second", () => {
    const { onSeek } = setup();

    expect(screen.getByText("1:05 de 2:05")).toBeInTheDocument();
    const bar = screen.getByRole("slider", { name: t.position });
    expect(bar).toHaveValue("65");
    fireEvent.change(bar, { target: { value: "90" } });
    expect(onSeek).toHaveBeenCalledWith(90);
  });

  it("waits for the projector's window to say how long the video is", () => {
    setup({ progress: null });

    expect(screen.getByRole("slider", { name: t.position })).toBeDisabled();
    expect(screen.getByText("-:--")).toBeInTheDocument();
  });

  it("restarts, repeats and mutes, and says which of the two are on", () => {
    const { onRestart, onToggleLoop, onToggleMute, rerender, ...rest } = setup();
    fireEvent.click(screen.getByRole("button", { name: t.restart }));
    fireEvent.click(screen.getByRole("button", { name: t.loop }));
    fireEvent.click(screen.getByRole("button", { name: t.mute }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onToggleLoop).toHaveBeenCalledTimes(1);
    expect(onToggleMute).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: t.loop })).toHaveAttribute("aria-pressed", "false");

    rerender(<VideoControls loop muted volume={1} progress={null} onRestart={onRestart} onToggleLoop={onToggleLoop} onToggleMute={onToggleMute} onVolume={rest.onVolume} onSeek={rest.onSeek} />);
    expect(screen.getByRole("button", { name: t.loop })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: t.unmute })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("slider", { name: t.volume })).toHaveValue("0");
  });

  it("sets the volume from the slider", () => {
    const { onVolume } = setup({ volume: 0.5 });

    expect(screen.getByRole("slider", { name: t.volume })).toHaveValue("0.5");
    fireEvent.change(screen.getByRole("slider", { name: t.volume }), { target: { value: "0.8" } });
    expect(onVolume).toHaveBeenCalledWith(0.8);
  });

  it("has no accessibility violations", async () => {
    const { container } = setup();
    expect((await axe(container)).violations).toEqual([]);
  });
});
