// Public API (client-safe). Server-only exports live in `./server`.
export { PASS_LIFETIME_SECONDS } from "./domain/pass-code";
export type { PassError, PassErrorCode } from "./domain/pass-error";
export type { IssuePassAction, IssuePassActionResult, PassView } from "./ui/action";
export { PassDisplay, type PassDisplayProps } from "./ui/PassDisplay";
