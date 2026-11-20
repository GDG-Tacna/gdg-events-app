// Public API (client-safe). Server-only exports live in `./server`.
export { BAN_REASON_MAX, CADETS_SEARCH_MAX, CADETS_SEARCH_MIN, type CadetsErrorCode } from "./domain/manage";
export { CadetsListView, type CadetsListViewProps } from "./ui/CadetsListView";
export { CadetDetailView, type CadetDetailViewProps } from "./ui/CadetDetailView";
export type {
  CadetSpeakerControls,
  CadetTeamControls,
  CadetTeamRole,
  BanCadetAction,
  CadetActionResult,
  CadetDetailData,
  CadetRow,
  ChangeCadetSquadAction,
  DeleteCadetAction,
  DeleteCadetActionResult,
  RenameCadetAction,
  UnbanCadetAction,
} from "./ui/actions";
