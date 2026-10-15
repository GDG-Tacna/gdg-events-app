import { getFirebaseAuth, getFirebaseFirestore } from "@/shared/lib/firebase/client";
import type { StageFeed } from "../../domain/stage-feed";
import { FirestoreStageFeed } from "./firestore-stage-feed";

/** The stage screen's live feed over this browser's Firebase app and session. */
export const createStageFeed = (): StageFeed => new FirestoreStageFeed(getFirebaseFirestore, getFirebaseAuth);
