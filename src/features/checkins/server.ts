import "server-only";

// Public API (server-only). Client code must import from "@/features/checkins" instead.
export type {
  AttemptLimiter,
  CheckInCounter,
  CheckInRepository,
  CheckpointCatalog,
  QrPayloadVerifier,
  QrSource,
  VerifiedScan,
} from "./domain/ports";
export type { Checkpoint } from "./domain/checkpoint";
export { recordCheckIn, type RecordCheckInDeps, type RecordCheckInResult } from "./domain/use-cases";
export { InMemoryAttemptLimiter } from "./data/in-memory-attempt-limiter";
export { StaticQrPayloadVerifier, staticPayloadFor } from "./data/static-qr-payload-verifier";
export { FirstMatchQrPayloadVerifier } from "./data/first-match-qr-payload-verifier";
export { FirestoreCheckInRepository } from "./data/server/firestore-check-in-repository";
export { FirestoreCheckInCounter } from "./data/server/firestore-check-in-counter";
export { FirestoreCheckpointCatalog } from "./data/server/firestore-checkpoint-catalog";
