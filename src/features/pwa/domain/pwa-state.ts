/** Where the "a new version is ready" flow is. */
export type UpdateStatus = "none" | "available" | "applying";

export interface PwaState {
  update: UpdateStatus;
  /** The last attempt to apply the update failed, so the prompt can say so while offering a retry. */
  updateFailed: boolean;
}

export type PwaEvent =
  | { type: "update-available" }
  | { type: "update-applying" }
  /** The new version could not be activated; the user can try again. */
  | { type: "update-failed" };

export const initialPwaState: PwaState = { update: "none", updateFailed: false };

/**
 * The update flow as a small state machine, so the rules live in one tested place:
 * an update can only be applied once it is available, a failed attempt goes back to available (and
 * remembers it failed until the next attempt), and a second "available" signal while applying must
 * not reset the progress.
 */
export function pwaReducer(state: PwaState, event: PwaEvent): PwaState {
  switch (event.type) {
    case "update-available":
      return state.update === "none" ? { update: "available", updateFailed: false } : state;
    case "update-applying":
      return state.update === "available" ? { update: "applying", updateFailed: false } : state;
    case "update-failed":
      return state.update === "applying" ? { update: "available", updateFailed: true } : state;
  }
}
