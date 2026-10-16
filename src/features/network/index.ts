// Public API (client-safe). Server-only exports live in `./server`.
export { isContactCode } from "./domain/contact-code";
export { LINK_KINDS, NO_LINKS, type ContactLinks, type LinkKind } from "./domain/links";
export type { CadetCard, ContactReward, NetworkErrorCode } from "./domain/network";
export type {
  ConnectContactAction,
  ConnectContactActionResult,
  ContactCodeView,
  IssueContactCodeAction,
  IssueContactCodeActionResult,
  SaveContactLinksAction,
  SaveContactLinksActionResult,
} from "./ui/actions";
export { CadetCardView, type CadetCardViewProps } from "./ui/CadetCardView";
export { NetworkView, type NetworkViewProps } from "./ui/NetworkView";
