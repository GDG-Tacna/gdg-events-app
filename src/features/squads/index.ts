// Public API (client-safe). Server-only exports live in `./server`.
export { isSquadId, type SquadId } from "@/shared/types/squad";
export { offeredSquads, type Squad } from "./domain/squad";
export type { SquadError, SquadErrorCode } from "./domain/squad-error";
export type { AssignSquadAction, AssignSquadActionResult } from "./ui/assignment";
export { SquadBadge, type SquadBadgeProps } from "./ui/SquadBadge";
export { SquadReveal, type SquadRevealProps } from "./ui/SquadReveal";
export {
  useSquadAssignment,
  type SquadAssignmentState,
  type SquadAssignmentStatus,
} from "./ui/use-squad-assignment";
export type {
  CreateSquadAction,
  MoveSquadAction,
  SeedSquadsAction,
  SquadAdminActionResult,
  SquadIdAction,
  SquadView,
  UpdateSquadAction,
} from "./ui/admin-actions";
export type { SquadAdminErrorCode } from "./domain/manage";
export { PixelLogoEditor, blankLogo, type PixelLogoEditorProps } from "./ui/PixelLogoEditor";
export { SquadForm, type SquadFormProps } from "./ui/SquadForm";
export { SquadsAdminView, type SquadsAdminViewProps } from "./ui/SquadsAdminView";
