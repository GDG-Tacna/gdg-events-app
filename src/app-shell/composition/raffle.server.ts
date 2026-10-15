import "server-only";
import { randomInt } from "node:crypto";
import { stageDeps } from "@/app-shell/composition/leaderboard.server";
import { FirestoreAuditLog } from "@/features/admin/server";
import { presentRaffle } from "@/features/leaderboard/server";
import { FirestoreRaffleStore, type RaffleDeps } from "@/features/raffle/server";
import { err, ok } from "@/shared/lib/result";
import { currentEditionOf } from "@/features/event/server";
import { ttlCached } from "@/shared/lib/ttl-cache";
import { recordImages } from "./media.server";

const store = new FirestoreRaffleStore();

/**
 * Composition root for the raffle: entrants are the edition's participants, the winner comes from
 * `crypto.randomInt` (uniform, unpredictable), and each draw is handed to the stage (leaderboard feature) so the
 * projector shows it; changes go to the admin audit trail.
 */
export const raffleDeps: RaffleDeps = {
  store,
  entrants: { list: () => store.entrants() },
  random: (max) => randomInt(max),
  images: recordImages,
  stage: {
    present: async (draw, reel) => {
      const shown = await presentRaffle(stageDeps, {
        drawId: draw.id,
        prizeName: draw.prizeName,
        prizeImageUrl: draw.prizeImageUrl ?? null,
        winnerAlias: draw.winnerAlias,
        winnerSquadId: draw.winnerSquadId,
        tickets: draw.tickets,
        totalTickets: draw.totalTickets,
        reel,
        at: draw.at,
      });
      return shown.ok ? ok(undefined) : err({ code: "unknown" });
    },
  },
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};

/**
 * The raffle card of the dashboard: the minimum of G-Credits kept for a minute (every visit would read it again),
 * the cadet's own draws as stored. A draw always reads the settings fresh through `raffleDeps`.
 */
export const raffleCardDeps = {
  store: {
    settings: ttlCached(() => store.settings(), { key: currentEditionOf }),
    drawsOf: (uid: string) => store.drawsOf(uid),
  },
};
