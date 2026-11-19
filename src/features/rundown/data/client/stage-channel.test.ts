import { describe, expect, it, vi } from "vitest";
import type { ChannelMessage } from "../../domain/channel";
import { openStageChannel, STAGE_CHANNEL_NAME, type ChannelLike } from "./stage-channel";

/** Two ends of one channel: what one posts the other hears, as a BroadcastChannel does for another window. */
function pair() {
  const ends: Array<{ listeners: Set<(event: { data: unknown }) => void> }> = [{ listeners: new Set() }, { listeners: new Set() }];
  const names: string[] = [];
  const make = (index: number) => (name: string): ChannelLike => {
    names.push(name);
    return {
      postMessage: (message) => ends[1 - index].listeners.forEach((listener) => listener({ data: message })),
      addEventListener: (_type, listener) => void ends[index].listeners.add(listener),
      removeEventListener: (_type, listener) => void ends[index].listeners.delete(listener),
      close: () => ends[index].listeners.clear(),
    };
  };
  return { console: openStageChannel(make(0))!, stage: openStageChannel(make(1))!, names };
}

describe("openStageChannel", () => {
  it("carries a message to the other window, which hears it", () => {
    const { console: consoleEnd, stage, names } = pair();
    const heard: ChannelMessage[] = [];
    stage.subscribe((message) => heard.push(message));

    consoleEnd.post({ type: "transport", slide: 4, playing: true });

    expect(heard).toEqual([{ type: "transport", slide: 4, playing: true }]);
    expect(names).toEqual([STAGE_CHANNEL_NAME, STAGE_CHANNEL_NAME]);
  });

  it("does not echo a message back to its sender", () => {
    const { console: consoleEnd } = pair();
    const handler = vi.fn();
    consoleEnd.subscribe(handler);

    consoleEnd.post({ type: "ping" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("drops what is not one of ours, and stops listening when asked", () => {
    const names: string[] = [];
    let listener: ((event: { data: unknown }) => void) | null = null;
    const channel = openStageChannel((name) => {
      names.push(name);
      return {
        postMessage: () => undefined,
        addEventListener: (_type, added) => void (listener = added),
        removeEventListener: () => void (listener = null),
        close: () => undefined,
      };
    })!;
    const handler = vi.fn();

    const stop = channel.subscribe(handler);
    listener!({ data: { type: "format-disk" } });
    listener!({ data: "hola" });
    listener!({ data: { type: "ping" } });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: "ping" });

    stop();
    expect(listener).toBeNull();
  });

  it("answers null in a browser without BroadcastChannel", () => {
    expect(openStageChannel(null)).toBeNull();
  });
});
