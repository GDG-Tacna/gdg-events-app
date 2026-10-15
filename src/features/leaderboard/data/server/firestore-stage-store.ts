import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { EVENT_CONFIG_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { STAGE_DOC } from "../paths";
import { parseStageState, type StageState, type StageStore } from "../../domain/stage";


/**
 * Firestore adapter (Admin SDK) for the stage. The whole state is written at once, as plain data, so the screen
 * listening to it never sees half a change.
 */
export class FirestoreStageStore implements StageStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async ref() {
    return eventCollection(this.getDb(), await this.getEventId(), EVENT_CONFIG_COLLECTION).doc(STAGE_DOC);
  }

  async read(): Promise<Result<StageState | null, { code: string }>> {
    try {
      const snapshot = await (await this.ref()).get();
      if (!snapshot.exists) return ok(null);
      const state = parseStageState(snapshot.data());
      if (!state) logServerError("stage.parse", new Error("the stage document breaks the rules; using the default"));
      return ok(state);
    } catch (cause) {
      logServerError("stage.read", cause);
      return err({ code: "unknown" });
    }
  }

  async save(state: StageState): Promise<Result<void, { code: string }>> {
    try {
      // Plain copies: arrays and objects shared with callers never go to the SDK.
      const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
      await (await this.ref()).set({
        display: state.display,
        view: state.view,
        frozen: state.frozen ? { cadets: plain(state.frozen.cadets), squads: plain(state.frozen.squads), at: state.frozen.at } : null,
        champions: state.champions ? plain(state.champions) : null,
        raffle: state.raffle ? { ...plain({ ...state.raffle, at: null }), at: state.raffle.at } : null,
        updatedAt: new Date(),
      });
      return ok(undefined);
    } catch (cause) {
      logServerError("stage.save", cause);
      return err({ code: "unknown" });
    }
  }
}
