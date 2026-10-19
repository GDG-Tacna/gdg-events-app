import { describe, expect, it, vi } from "vitest";

/** A fresh module each time: the sink and the pending events are module state. */
const loadModule = async () => {
  vi.resetModules();
  return import("./analytics");
};

describe("track", () => {
  it("hands events to the sink, including the ones recorded before it was plugged in", async () => {
    const { setAnalyticsSink, track } = await loadModule();
    const sink = vi.fn();

    track({ name: "poll_vote" });
    setAnalyticsSink(sink);
    track({ name: "check_in", params: { kind: "talk" } });

    expect(sink.mock.calls).toEqual([[{ name: "poll_vote" }], [{ name: "check_in", params: { kind: "talk" } }]]);
  });

  it("keeps only a few events while there is no sink", async () => {
    const { setAnalyticsSink, track } = await loadModule();
    for (let i = 0; i < 50; i += 1) track({ name: "contact_made" });
    const sink = vi.fn();

    setAnalyticsSink(sink);

    expect(sink).toHaveBeenCalledTimes(20);
  });

  it("never lets a failing sink break the screen", async () => {
    const { setAnalyticsSink, track } = await loadModule();
    setAnalyticsSink(() => {
      throw new Error("blocked");
    });

    expect(() => track({ name: "contact_made" })).not.toThrow();
  });
});
