"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/shared/copy/es";
import type { ProjectTalkAction } from "./admin-actions";

/**
 * Puts a talk's QR on the stage screen right away, then takes the admin to the stage controls (where the QR can be
 * taken off again). `error` is the server's own sentence for why it did not work.
 */
export function useProjectTalk(project: ProjectTalkAction, stageHref: string) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function projectTalk(id: string) {
    if (busy) return;
    setBusy(id);
    setError(null);
    let result;
    try {
      result = await project({ id });
    } catch {
      result = { ok: false as const, text: copy.admin.stage.errors.unknown };
    }
    setBusy(null);
    if (!result.ok) return setError(result.text);
    router.push(stageHref);
  }

  return { projectTalk, projecting: busy, projectError: error };
}
