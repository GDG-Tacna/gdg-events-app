import { lazy, type ComponentType } from "react";
import type { MinigameId } from "../../domain/catalog";
import type { GameProps } from "./shared";

/**
 * The games, each loaded only when it is played so none weighs on the rest of the app. A game of the catalog
 * not listed here cannot be started (the frame says it is not available).
 */
export const GAMES: Partial<Record<MinigameId, ComponentType<GameProps>>> = {
  "warp-timing": lazy(() => import("./warp-timing/WarpTiming").then((module) => ({ default: module.WarpTiming }))),
  circuits: lazy(() => import("./circuits/Circuits").then((module) => ({ default: module.Circuits }))),
  "code-order": lazy(() => import("./code-order/CodeOrder").then((module) => ({ default: module.CodeOrder }))),
  "bug-invaders": lazy(() => import("./bug-invaders/BugInvaders").then((module) => ({ default: module.BugInvaders }))),
  "bug-kong": lazy(() => import("./bug-kong/BugKong").then((module) => ({ default: module.BugKong }))),
};

export const isPlayable = (game: MinigameId) => GAMES[game] !== undefined;
