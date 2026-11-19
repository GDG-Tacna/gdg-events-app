"use client";

import { useCallback } from "react";
import { QrDisplay } from "@/features/ephemeral-qr";
import { copy } from "@/shared/copy/es";
import { issueTeamCodeAction } from "./code.action";

/** A team member's rotating code, on the talks' code screen with the team code's own words. */
export function TeamCodeScreen({ role }: { role: "organizer" | "volunteer" }) {
  // The screen asks by the id it shows; the server takes who is asking from the session, not from here.
  const issue = useCallback(() => issueTeamCodeAction(), []);
  return <QrDisplay checkpointId={role} name={copy.teamCode.roles[role]} issue={issue} texts={copy.teamCode.qr} />;
}
