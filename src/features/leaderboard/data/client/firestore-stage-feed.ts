import type { Auth } from "firebase/auth";
import { collection, doc, onSnapshot, type Firestore, type FirestoreError } from "firebase/firestore";
import { CONFIG_STAGE_PATH, PARTICIPANTS_PATH } from "../paths";
import { participantEntry } from "../../domain/ranking";
import { DEFAULT_STAGE, parseStageState } from "../../domain/stage";
import type { StageFeed, StageFeedHandlers } from "../../domain/stage-feed";

/**
 * The stage screen's live listeners, with the Firebase client SDK and the admin's own session on this browser (the
 * rules let admins read the stage and the participants). Two listeners in all: the stage document and the edition's
 * participants, so the screen computes the ranking itself and never asks again. A refused listener gets one retry
 * with a fresh token (an admin role granted after this browser signed in); after that the screen says so.
 */
export class FirestoreStageFeed implements StageFeed {
  constructor(
    private readonly getDb: () => Firestore,
    private readonly getAuth: () => Auth,
  ) {}

  subscribe(eventId: string, handlers: StageFeedHandlers): () => void {
    let stopped = false;
    let retried = false;
    let listeners: Array<() => void> = [];
    const stopAll = () => {
      listeners.forEach((stop) => stop());
      listeners = [];
    };

    const start = async () => {
      const auth = this.getAuth();
      await auth.authStateReady();
      if (stopped) return;
      if (!auth.currentUser) {
        handlers.status("signed-out");
        return;
      }
      handlers.status("connecting");
      const db = this.getDb();
      // Live only when both answer from the server; a cached answer means the connection dropped.
      const cached = { stage: true, participants: true };
      const report = () => handlers.status(cached.stage || cached.participants ? "reconnecting" : "live");

      const onError = async (error: FirestoreError) => {
        if (stopped) return;
        if (error.code === "permission-denied" && !retried) {
          retried = true;
          stopAll();
          await auth.currentUser?.getIdToken(true);
          if (!stopped) void start();
          return;
        }
        handlers.status(error.code === "permission-denied" ? "denied" : "reconnecting");
      };

      listeners.push(
        onSnapshot(
          doc(db, CONFIG_STAGE_PATH(eventId)),
          { includeMetadataChanges: true },
          (snapshot) => {
            cached.stage = snapshot.metadata.fromCache;
            handlers.stage((snapshot.exists() ? parseStageState(snapshot.data()) : null) ?? DEFAULT_STAGE);
            report();
          },
          (error) => void onError(error),
        ),
        onSnapshot(
          collection(db, PARTICIPANTS_PATH(eventId)),
          { includeMetadataChanges: true },
          (snapshot) => {
            cached.participants = snapshot.metadata.fromCache;
            handlers.participants(snapshot.docs.flatMap((document) => participantEntry(document.id, document.data()) ?? []));
            report();
          },
          (error) => void onError(error),
        ),
      );
    };

    void start();
    return () => {
      stopped = true;
      stopAll();
    };
  }
}
