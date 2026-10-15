// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecordCheckInAction, RecordCheckInActionResult } from "@/features/checkins";
import { fakeQrCamera } from "@/test-utils/fake-qr-camera";
import type { CameraErrorCode } from "../domain/camera";
import type { ScanState } from "../domain/scan-state";
import { useScanner } from "./use-scanner";

const success: RecordCheckInActionResult = { ok: true, checkpointId: "talk-keynote", kind: "talk", recorded: true, firstEntrance: false };

/** Renders a component that uses the hook and shows its camera, like the real screen does. */
function mount(record: RecordCheckInAction, failWith?: CameraErrorCode) {
  const fake = fakeQrCamera(failWith);
  const Camera = fake.camera;
  const holder: { current: ReturnType<typeof useScanner> | null } = { current: null };
  function Harness() {
    const scan = useScanner(record);
    holder.current = scan;
    return scan.camera ? <Camera key={scan.cameraKey} {...scan.camera} label="Cámara" /> : null;
  }
  const view = render(<Harness />);
  return { ...view, fake, scan: () => holder.current!, state: (): ScanState => holder.current!.state };
}

describe("useScanner", () => {
  it("looks for a code straight away, with the camera running", () => {
    const t = mount(vi.fn());

    expect(t.state()).toEqual({ status: "scanning" });
    expect(t.fake.paused()).toBe(false);
    expect(t.fake.record.mounts).toBe(1);
  });

  it("sends the first code it reads and pauses the camera while the server answers", async () => {
    let answer: (value: RecordCheckInActionResult) => void = () => undefined;
    const record = vi.fn(() => new Promise<RecordCheckInActionResult>((resolve) => (answer = resolve)));
    const t = mount(record);

    await t.fake.see("devfest:eq:talk");

    expect(record).toHaveBeenCalledWith("devfest:eq:talk");
    expect(t.state()).toEqual({ status: "sending" });
    expect(t.fake.paused()).toBe(true);

    await act(async () => answer(success));
    expect(t.state()).toEqual({ status: "done", outcome: { ok: true, kind: "talk", recorded: true, firstEntrance: false, missions: [], talkCredits: 0, achievements: [] } });
    // The answer is on screen: the camera stays paused until the cadet asks for another scan.
    expect(t.fake.paused()).toBe(true);
  });

  it("sends only one code at a time, even if the camera reports another while the first is on its way", async () => {
    const record = vi.fn(() => new Promise<RecordCheckInActionResult>(() => undefined));
    const t = mount(record);

    await t.fake.see("code-1");
    await act(async () => t.fake.record.props?.onDetect("code-2"));

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith("code-1");
  });

  it("keeps the missions, talk credits and badges the server reported", async () => {
    const missions = [{ title: "Charla", xpEarned: 50, creditsEarned: 5, justCompleted: true }];
    const achievements = [{ id: "primer-salto", name: "Primer salto", tone: "cyan" }];
    const t = mount(vi.fn(async () => ({ ...success, missions, talkCredits: 10, achievements })));

    await t.fake.see("code");

    expect(t.state()).toMatchObject({ status: "done", outcome: { ok: true, missions, talkCredits: 10, achievements } });
  });

  it("shows a refusal with its code only", async () => {
    const t = mount(vi.fn(async () => ({ ok: false, code: "staff-station" }) as const));

    await t.fake.see("devfest:cp:lunch-1");

    expect(t.state()).toEqual({ status: "done", outcome: { ok: false, code: "staff-station" } });
  });

  it("treats a server action that throws as an unknown failure instead of freezing", async () => {
    const t = mount(vi.fn(async () => {
      throw new Error("network");
    }));

    await t.fake.see("code");

    expect(t.state()).toEqual({ status: "done", outcome: { ok: false, code: "unknown" } });
  });

  it("looks again after a result, and reads the next code", async () => {
    const record = vi.fn(async () => success);
    const t = mount(record);
    await t.fake.see("code-1");

    act(() => t.scan().scanAgain());

    expect(t.state()).toEqual({ status: "scanning" });
    expect(t.fake.paused()).toBe(false);
    await t.fake.see("code-2");
    expect(record).toHaveBeenLastCalledWith("code-2");
    // The same camera kept running: no new permission prompt.
    expect(t.fake.record.mounts).toBe(1);
  });

  it("ignores scan again while nothing is on screen", () => {
    const t = mount(vi.fn());

    act(() => t.scan().scanAgain());

    expect(t.state()).toEqual({ status: "scanning" });
  });

  it.each(["denied", "no-camera", "unsupported", "failed"] as const)("reports a camera that cannot start (%s) and takes it off the screen", (code) => {
    const t = mount(vi.fn(), code);

    expect(t.state()).toEqual({ status: "camera-error", code });
    expect(t.scan().camera).toBeNull();
    expect(t.fake.record.unmounts).toBe(1);
  });

  it("tries a fresh camera when asked after a problem, and only then", async () => {
    const t = mount(vi.fn(), "denied");
    t.fake.record.failWith = undefined;

    act(() => t.scan().start());

    expect(t.state()).toEqual({ status: "scanning" });
    expect(t.fake.record.mounts).toBe(2);

    act(() => t.scan().start());
    expect(t.fake.record.mounts).toBe(2);
  });

  it("reports a camera that stops working while scanning", async () => {
    const t = mount(vi.fn());

    await t.fake.fail("failed");

    expect(t.state()).toEqual({ status: "camera-error", code: "failed" });
  });

  it("drops an answer that arrives after the screen was closed", async () => {
    let answer: (value: RecordCheckInActionResult) => void = () => undefined;
    const t = mount(vi.fn(() => new Promise<RecordCheckInActionResult>((resolve) => (answer = resolve))));
    await t.fake.see("code");

    t.unmount();
    await act(async () => answer(success));

    expect(t.fake.record.unmounts).toBe(1);
  });
});
