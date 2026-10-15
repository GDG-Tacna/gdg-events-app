import type { SuggestErrorCode, SuggestedMission } from "../domain/suggest";

export type SuggestMissionsActionResult = { ok: true; suggestions: SuggestedMission[] } | { ok: false; code: SuggestErrorCode };

export type SuggestMissionsAction = (input: {
  topic: string;
  quadrantId: string;
  types: string[];
  count: number;
}) => Promise<SuggestMissionsActionResult>;
