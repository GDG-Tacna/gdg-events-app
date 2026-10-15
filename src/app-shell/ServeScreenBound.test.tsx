// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";

vi.mock("@/app-shell/checkpoints/serve-attendee.action", () => ({ serveAttendeeAction: vi.fn() }));

vi.mock("@/features/scanner", async (importOriginal) => {
  const { fakeQrCamera } = await import("@/test-utils/fake-qr-camera");
  return { ...(await importOriginal<typeof import("@/features/scanner")>()), QrCodeCamera: fakeQrCamera().camera };
});

const { ServeScreenBound } = await import("./ServeScreenBound");

describe("ServeScreenBound", () => {
  it("shows the station's screen with the real camera, its kind's counter, and a way back to the list", () => {
    render(<ServeScreenBound checkpointId="stand-cloud" kind="stand" name="Stand Cloud" initialCount={7} />);

    expect(screen.getByRole("heading", { level: 1, name: "Stand Cloud" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: copy.scanner.videoLabel })).toBeInTheDocument();
    expect(screen.getByText(copy.staff.counterLabel.stand)).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.staff.back })).toHaveAttribute("href", "/staff");
  });
});
