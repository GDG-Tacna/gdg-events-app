import "server-only";
import { teamByMissionRole } from "@/app-shell/composition/mission-team.server";
import { speakerStore } from "@/app-shell/composition/speakers.server";
import type { PublicMissionConfig } from "@/features/missions";

/**
 * The names a cadet is told to look for on a speaker or team mission that names certain people (nothing when it accepts
 * everyone, or for any other type). Speakers are public; a team member shows only the name on their account, never their
 * email, and someone with no name is left out. The names only help the cadet, so a failed read answers none and the
 * mission shows its general instructions.
 */
export async function missionPeopleNames(config: PublicMissionConfig): Promise<readonly string[]> {
  if (config.type === "speaker" && config.speakerIds !== null) {
    const speakers = await speakerStore.list();
    if (!speakers.ok) return [];
    const named = new Map(speakers.value.filter((speaker) => speaker.active).map((speaker) => [speaker.id, speaker.name]));
    return config.speakerIds.flatMap((id) => named.get(id) ?? []);
  }
  if (config.type === "team" && config.memberUids !== null) {
    const team = await teamByMissionRole();
    if (!team.ok) return [];
    const chosen = new Set(config.memberUids);
    return team.value[config.role].flatMap((member) => (chosen.has(member.uid) && member.displayName ? [member.displayName] : []));
  }
  return [];
}
