import { parseChannelMessage, type ChannelMessage } from "../../domain/channel";

/** The name both windows listen on. Another app of the same browser never sees it: a `BroadcastChannel` is per origin. */
export const STAGE_CHANNEL_NAME = "devfest-stage-console";

/** The part of `BroadcastChannel` the console uses, so a test can stand in for it. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  close(): void;
}

export interface StageChannel {
  post(message: ChannelMessage): void;
  /** Calls `handler` with each valid message from the other window; answers how to stop. */
  subscribe(handler: (message: ChannelMessage) => void): () => void;
  close(): void;
}

/**
 * The line between the console and the projector's window. Messages that are not ours, or are malformed, are dropped. `null`
 * when the browser has no `BroadcastChannel`: the console then says the screen cannot be reached.
 */
export function openStageChannel(create: ((name: string) => ChannelLike) | null = typeof BroadcastChannel === "undefined" ? null : (name) => new BroadcastChannel(name)): StageChannel | null {
  if (!create) return null;
  const channel = create(STAGE_CHANNEL_NAME);
  return {
    post: (message) => channel.postMessage(message),
    subscribe(handler) {
      const listener = (event: { data: unknown }) => {
        const message = parseChannelMessage(event.data);
        if (message) handler(message);
      };
      channel.addEventListener("message", listener);
      return () => channel.removeEventListener("message", listener);
    },
    close: () => channel.close(),
  };
}
