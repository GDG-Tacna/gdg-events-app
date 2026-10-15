"use server";

import { z } from "zod";
import type { ChooseEditionResult } from "@/features/event";
import { listEditionChoices } from "@/features/event/server";
import { FEATURES } from "@/shared/config/features";
import { isEventId } from "@/shared/types/event";
import { editionsDeps } from "../composition/event.server";
import { getSession } from "../guards";
import { writeWorkingEdition } from "../working-edition.server";
import { allowedEditions } from "./working-edition.server";

const inputSchema = z.object({ id: z.string().max(60) });

/**
 * Picks the edition this person works in from now on in the control center. Public endpoint: the session decides
 * which editions may be picked (all for an admin of every edition, its own for an organizer). Picking the public
 * edition clears the choice; the next requests read and write the chosen edition.
 */
export async function chooseWorkingEditionAction(input: { id: string }): Promise<ChooseEditionResult> {
  if (!FEATURES.admin) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || !isEventId(parsed.data.id)) return { ok: false, code: "not-found" };

  const allowed = await allowedEditions(session);
  if (allowed === null) return { ok: false, code: "forbidden" };
  const choices = await listEditionChoices(editionsDeps, allowed);
  if (!choices.ok) return { ok: false, code: "unknown" };
  const choice = choices.value.find((entry) => entry.id === parsed.data.id);
  if (!choice) return { ok: false, code: "forbidden" };

  const saved = await writeWorkingEdition(session.uid, choice.isPublic ? null : choice.id);
  return saved ? { ok: true } : { ok: false, code: "unavailable" };
}
