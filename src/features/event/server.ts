import "server-only";

// Public API (server-only). Client code must import from "@/features/event" instead.
export { hasEventFinished, isFinished, type EventDeps, type EventInfo, type EventStore } from "./domain/event";
export {
  createEdition,
  listEditionChoices,
  listEditions,
  publishEdition,
  setEditionStatus,
  updateEdition,
  type Edition,
  type EditionCatalog,
  type EditionChoice,
  type EditionDraft,
  type EditionListing,
  type EditionsActor,
  type EditionsDeps,
  type EditionsErrorCode,
} from "./domain/editions";
export { COPY_NEEDS, COPY_PARTS, copyEditionContent, isCopyPart, withNeeds, type CopyDeps, type CopyError, type CopyErrorCode, type CopyPart, type EditionCopier } from "./domain/copy";
export { FirestoreEditionCopier } from "./data/server/firestore-edition-copier";
export { EDITION_MODULES, MODULE_NEEDS, effectiveModules, getEditionModules, isEditionModule, listOffModules, setEditionModules, type EditionModule, type ModuleDeps, type ModuleStore, type ModuleSwitches, type ModulesErrorCode } from "./domain/modules";
export { FirestoreModuleStore } from "./data/server/firestore-module-store";
export {
  ADMIN_SECTIONS,
  DEFAULT_PERMISSIONS,
  getEditionPermissions,
  isAdminSection,
  sectionAccess,
  setEditionPermissions,
  type AccessLevel,
  type AdminSection,
  type EditionPermissions,
  type PermissionDeps,
  type PermissionsErrorCode,
  type StaffStation,
} from "./domain/permissions";
export { FirestorePermissionStore } from "./data/server/firestore-permission-store";
export { FirestoreEditionCatalog, FirestoreEventStore } from "./data/server/firestore-event-store";
export { currentEditionOf, forgetPublicEdition, publicEditionId, runInEdition, registerRequestEdition } from "./data/server/public-edition";
