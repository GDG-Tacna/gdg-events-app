// Public API (client-safe). Server-only exports live in `./server`.
export type { AvatarErrorCode } from "./domain/avatar";
export type { AvatarActionResult, ResetAvatarAction, SaveAvatarAction } from "./ui/actions";
export { AvatarEditor, type AvatarEditorProps } from "./ui/AvatarEditor";
