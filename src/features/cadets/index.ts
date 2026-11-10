// Public API (client-safe). Server-only exports live in `./server`.
export { BAN_REASON_MAX, type CadetsErrorCode } from "./domain/manage";
export { CadetsListView, type CadetsListViewProps } from "./ui/CadetsListView";
export { CadetDetailView, type CadetDetailViewProps } from "./ui/CadetDetailView";
export type {
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
