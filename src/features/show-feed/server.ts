import "server-only";

// Public API (server-only): the show feed is read only by route handlers.
export {
  SHOW_FEED_TOKEN_MIN,
  TALK_QR_MARGIN_MS,
  checkFeedAccess,
  feedTalks,
  getTalkQr,
  talkQrOpen,
  type FeedAccess,
  type FeedIssuedQr,
  type FeedTalk,
  type FeedTalkQr,
  type FeedTalkView,
  type TalkQrDeps,
  type TalkQrErrorCode,
} from "./domain/show-feed";
