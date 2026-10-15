import "server-only";

// Public API (server-only). Client code must import from "@/features/network" instead.
export * from "./domain/contact-code";
export * from "./domain/links";
export {
  connectCadets,
  contactId,
  countContacts,
  getNetwork,
  issueContactCode,
  saveContactLinks,
  verifyContactCode,
  type CadetCard,
  type CadetDirectory,
  type CardStore,
  type ConnectOutcome,
  type Contact,
  type ContactReward,
  type ContactStore,
  type IssuedContactCode,
  type NetworkActor,
  type NetworkDeps,
  type NetworkError,
  type NetworkErrorCode,
  type NetworkOverview,
} from "./domain/network";
export { FirestoreNetworkStore } from "./data/server/firestore-network-store";
