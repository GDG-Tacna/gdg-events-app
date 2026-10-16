import type { AvatarLook } from "@/shared/ui/pixel/avatar-look";
import type { AvatarErrorCode } from "../domain/avatar";

export type AvatarActionResult = { ok: true } | { ok: false; code: AvatarErrorCode };
export type SaveAvatarAction = (input: { look: AvatarLook }) => Promise<AvatarActionResult>;
export type ResetAvatarAction = () => Promise<AvatarActionResult>;
