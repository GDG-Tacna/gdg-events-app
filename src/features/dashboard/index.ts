// Public API (client-safe). The use case is pure: the app shell binds the attendee repository to it.
export {
  buildOverview,
  decideSquadCallout,
  type DashboardOverview,
  type SquadCalloutKind,
} from "./domain/overview";
export { getAttendeeOverview, type AttendeeSource, type DashboardError } from "./domain/use-cases";
export type { WalletView } from "./domain/overview";
export { DashboardView, type DashboardViewProps } from "./ui/DashboardView";
export { PlayerCard, type PlayerCardProps } from "./ui/PlayerCard";
export { MissionsCard, type MissionsCardProps } from "./ui/MissionsCard";
export { SquadCallout, type SquadCalloutProps } from "./ui/SquadCallout";
