import type { RankAdminErrorCode } from "../domain/rank-admin";

export type SaveRanksActionResult = { ok: true } | { ok: false; code: RankAdminErrorCode };
export type SaveRanksAction = (ranks: Array<{ id: string; name: string; minXp: number; iconPath?: string | null }>) => Promise<SaveRanksActionResult>;
