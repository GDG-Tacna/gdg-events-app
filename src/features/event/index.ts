// Public API (client-safe). Server-only exports live in `./server`.
export { fromEventLocal, isFinished, toEventLocal, type EventInfo } from "./domain/event";
export { EDITION_NAME_MAX, EDITION_VENUE_MAX, suggestEditionId, type EditionChoice, type EditionDraft, type EditionStage, type EditionStatus, type EditionsErrorCode } from "./domain/editions";
export { EventsAdminView, type EditionRow, type EventsAdminViewProps } from "./ui/EventsAdminView";
export type { ChooseEditionAction, ChooseEditionResult, CopyEditionAction, CopyEditionResult, EditionActionResult, SaveModulesAction, SaveModulesResult, SavePermissionsAction, SavePermissionsResult, PublishEditionAction, SaveEditionAction, SetEditionStatusAction } from "./ui/actions";
export { EditionSwitcher, WorkingEditionNotice, type EditionSwitcherProps, type WorkingEditionNoticeProps } from "./ui/EditionSwitcher";
export { MyEditionsView, type MyEditionsViewProps } from "./ui/MyEditionsView";
export { COPY_NEEDS, COPY_PARTS, withNeeds, type CopyErrorCode, type CopyPart } from "./domain/copy";
export { EDITION_MODULES, MODULE_NEEDS, effectiveModules, type EditionModule, type ModuleSwitches, type ModulesErrorCode } from "./domain/modules";
export { ACCESS_LEVELS, ADMIN_SECTIONS, DEFAULT_PERMISSIONS, STAFF_STATIONS, type AccessLevel, type AdminSection, type EditionPermissions, type PermissionsErrorCode, type StaffStation } from "./domain/permissions";
