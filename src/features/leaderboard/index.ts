// Public API (client-safe). Server-only exports live in `./server`.
export { TOP_SIZE, type BoardCadet, type CadetStanding, type FleetBoard, type RankedCadet, type SquadStanding } from "./domain/ranking";
export { DEFAULT_STAGE, STAGE_VIEWS, parseStageState, type StageChampions, type StageCommand, type StageDisplay, type StageErrorCode, type StageState, type StageView } from "./domain/stage";
export { StandingCard, type StandingCardProps } from "./ui/StandingCard";
export type { UpdateStageAction, UpdateStageActionResult } from "./ui/stage-actions";
export { StageControlView, type StageControlViewProps } from "./ui/StageControlView";
export { StageScreen, type StageScreenProps, type StageSquad } from "./ui/stage/StageScreen";
export type { SquadSprites } from "./ui/stage/stage-parts";
export type { FeedStatus, StageFeed, StageFeedHandlers } from "./domain/stage-feed";
export { createStageFeed } from "./data/client/create-stage-feed";
