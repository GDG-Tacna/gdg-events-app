// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";

vi.mock("@/app-shell/checkins/record-check-in.action", () => ({ recordCheckInAction: vi.fn() }));

const seen = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("@/features/scanner", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/scanner")>();
  const { fakeQrCamera } = await import("@/test-utils/fake-qr-camera");
  return {
    ...original,
    QrCodeCamera: fakeQrCamera().camera,
    ScannerView: (props: Parameters<typeof original.ScannerView>[0]) => {
      seen.props = props as unknown as Record<string, unknown>;
      return original.ScannerView(props);
    },
  };
});

const { ScannerScreen } = await import("./ScannerScreen");
const { QrCodeCamera } = await import("@/features/scanner");
const { recordCheckInAction } = await import("@/app-shell/checkins/record-check-in.action");

describe("ScannerScreen", () => {
  it("binds the real camera and the check-in action to the scanner", () => {
    render(<ScannerScreen achievementsOn networkOn />);

    expect(screen.getByRole("heading", { level: 1, name: copy.scanner.title })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: copy.scanner.videoLabel })).toBeInTheDocument();
    expect(seen.props).toMatchObject({ camera: QrCodeCamera, record: recordCheckInAction });
  });

  it("links home, to Logros, to the Red and to the cadet's own QR (for a printed station code)", () => {
    render(<ScannerScreen achievementsOn networkOn />);

    expect(seen.props).toMatchObject({ homeHref: "/dashboard", achievementsHref: "/achievements", networkHref: "/red", passHref: "/pass" });
  });

  it("leaves out the links of modules the edition has off", () => {
    render(<ScannerScreen achievementsOn={false} networkOn={false} />);

    expect(seen.props).toMatchObject({ achievementsHref: undefined, networkHref: undefined });
  });
});
