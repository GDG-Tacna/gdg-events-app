import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ephemeralQrDeps } from "@/app-shell/composition/ephemeral-qr.server";
import { stageDeps } from "@/app-shell/composition/leaderboard.server";
import { pollStore } from "@/app-shell/composition/polls.server";
import { rundownDeps } from "@/app-shell/composition/rundown.server";
import { requireRole } from "@/app-shell/guards";
import { updateStageAction } from "@/app-shell/leaderboard/stage.actions";
import { moduleOn } from "@/app-shell/modules.server";
import { requireSection } from "@/app-shell/permissions.server";
import { loadConsoleAgenda } from "@/app-shell/rundown/agenda.server";
import { saveCuesAction, saveMinutesAction, savePointsAction } from "@/app-shell/rundown/rundown.actions";
import { projectTalkAction } from "@/app-shell/talks/project.action";
import { listTalks } from "@/features/ephemeral-qr/server";
import { currentEditionId, getStage } from "@/features/leaderboard/server";
import { comparePolls } from "@/features/polls/server";
import { RundownConsole, mergeAgenda } from "@/features/rundown";
import { getRundownPlan, getStoredCues } from "@/features/rundown/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";

export const metadata: Metadata = { title: `${copy.stageConsole.title} · ${copy.brand.name}`, robots: { index: false } };

/**
 * The stage console, full screen: the order of the event with its files, what is on the big screen and what comes next,
 * the controls and the quick scenes. Admins with access to the stage only. The files are read from this computer's own
 * folder in the browser, so this page and the projector's window must be open in the same browser.
 */
export default async function StageConsolePage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "stage");
  if (!(await moduleOn("leaderboard"))) notFound();

  const actor = { uid: session.uid, role: session.role };
  const [edition, talks, stored, plan, stage, squadsOn, polls, openTalks] = await Promise.all([
    currentEditionId(),
    loadConsoleAgenda(actor),
    getStoredCues(rundownDeps, actor),
    getRundownPlan(rundownDeps, actor),
    getStage(stageDeps),
    moduleOn("squads"),
    showablePolls(),
    FEATURES.checkins ? listTalks(ephemeralQrDeps, actor) : null,
  ]);
  // A failed read goes to the route's error boundary instead of showing an agenda or a stage that is not real.
  if (!talks) throw new Error("Could not read the agenda");
  if (!stage.ok) throw new Error("Could not read the stage");

  // The points made in the console and the minutes planned are extras: a failed read shows the agenda of the talks alone.
  const agenda = mergeAgenda(talks, plan.ok ? [...plan.value.points] : [], plan.ok ? plan.value.minutes : {});

  return (
    <RundownConsole
      edition={edition}
      agenda={agenda}
      qrItems={openTalks?.ok ? openTalks.value.map((talk) => talk.id) : []}
      // The stored pieces are decoration for an agenda that exists: a failed read starts with none instead of failing the console.
      stored={stored.ok ? stored.value : {}}
      frozen={stage.value.frozen !== null}
      view={stage.value.view}
      squadsOn={squadsOn}
      polls={polls}
      saveCues={saveCuesAction}
      savePoints={savePointsAction}
      saveMinutes={saveMinutesAction}
      runStage={updateStageAction}
      projectTalk={projectTalkAction}
      hrefs={{ screen: ROUTES.stage, settings: ROUTES.adminStage, raffle: ROUTES.adminRaffle, back: ROUTES.admin }}
    />
  );
}

/** The polls that can go on screen (opened at some point); none with polls off or when they cannot be read. */
async function showablePolls() {
  if (!FEATURES.polls || !(await moduleOn("polls"))) return [];
  const polls = await pollStore.list();
  if (!polls.ok) return [];
  return [...polls.value]
    .sort(comparePolls)
    .flatMap((poll) => (poll.status === "draft" ? [] : [{ id: poll.id, status: poll.status as "open" | "closed" }]));
}
