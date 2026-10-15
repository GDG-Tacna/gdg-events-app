// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IDetectedBarcode, IScannerProps } from "@yudiel/react-qr-scanner";

const library = vi.hoisted(() => ({ props: null as IScannerProps | null, overrides: null as { locateFile: (path: string, prefix: string) => string } | null }));
vi.mock("@yudiel/react-qr-scanner", () => ({
  Scanner: (props: IScannerProps) => {
    library.props = props;
    return <video data-testid="library-video" />;
  },
  setZXingModuleOverrides: (overrides: typeof library.overrides) => {
    library.overrides = overrides;
  },
}));

const { default: YudielQrCamera, ZXING_BASE, cameraErrorCodeOf, firstText } = await import("./yudiel-qr-camera");

const code = (rawValue: string): IDetectedBarcode => ({ rawValue, format: "qr_code", boundingBox: { x: 0, y: 0, width: 1, height: 1 }, cornerPoints: [] });

describe("YudielQrCamera", () => {
  const onDetect = vi.fn();
  const onError = vi.fn();
  beforeEach(() => vi.clearAllMocks());

  it("shows the camera under the given label and reads only QR codes, from the rear camera, silently and without the library's controls", () => {
    render(<YudielQrCamera paused={false} onDetect={onDetect} onError={onError} label="Vista de la cámara" />);

    expect(screen.getByRole("img", { name: "Vista de la cámara" })).toContainElement(screen.getByTestId("library-video"));
    expect(library.props).toMatchObject({
      paused: false,
      formats: ["qr_code"],
      // The rear camera, with no minimum size: a 480p webcam must still start.
      constraints: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      components: { finder: false, torch: false, onOff: false, zoom: false },
      sound: false,
    });
  });

  it("passes the pause through", () => {
    render(<YudielQrCamera paused onDetect={onDetect} onError={onError} label="x" />);

    expect(library.props?.paused).toBe(true);
  });

  it("reports the text of the first code read, and nothing for an empty read", () => {
    render(<YudielQrCamera paused={false} onDetect={onDetect} onError={onError} label="x" />);

    library.props?.onScan([code(""), code("devfest:at:abc"), code("other")]);
    library.props?.onScan([code("")]);
    library.props?.onScan([]);

    expect(onDetect).toHaveBeenCalledTimes(1);
    expect(onDetect).toHaveBeenCalledWith("devfest:at:abc");
  });

  it("reports camera problems in the screens' words, and not a stop made on purpose", () => {
    render(<YudielQrCamera paused={false} onDetect={onDetect} onError={onError} label="x" />);

    library.props?.onError?.({ kind: "permission-denied", message: "", cause: null });
    library.props?.onError?.({ kind: "aborted", message: "", cause: null });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("denied");
  });

  it("loads the QR decoder from the app itself, never from a CDN, and leaves other files where they are", () => {
    expect(library.overrides?.locateFile("zxing_reader.wasm", "https://fastly.jsdelivr.net/npm/zxing-wasm/dist/reader/")).toBe(`${ZXING_BASE}zxing_reader.wasm`);
    expect(library.overrides?.locateFile("other.js", "/base/")).toBe("/base/other.js");
  });
});

describe("cameraErrorCodeOf", () => {
  it.each([
    ["permission-denied", "denied"],
    ["security", "denied"],
    ["no-camera", "no-camera"],
    ["overconstrained", "no-camera"],
    ["insecure-context", "unsupported"],
    ["unsupported", "unsupported"],
    ["in-use", "failed"],
    ["type-error", "failed"],
    ["unknown", "failed"],
    ["aborted", null],
  ] as const)("%s → %s", (kind, expected) => {
    expect(cameraErrorCodeOf(kind)).toBe(expected);
  });
});

describe("firstText", () => {
  it("is the first non-empty code, or null", () => {
    expect(firstText([code("a"), code("b")])).toBe("a");
    expect(firstText([code("")])).toBeNull();
    expect(firstText([])).toBeNull();
  });
});

describe("the decoder served by the app", () => {
  it("is the same file the installed library uses (run `npm run zxing:copy` after an upgrade)", () => {
    const require = createRequire(import.meta.url);
    const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
    const installed = require.resolve("zxing-wasm/reader/zxing_reader.wasm");

    expect(hash(join(process.cwd(), "public", "zxing", "zxing_reader.wasm"))).toBe(hash(installed));
  });
});
