"use client";

import { useCallback } from "react";
import { QrDisplay } from "@/features/ephemeral-qr";
import { copy } from "@/shared/copy/es";
import { issueSpeakerCodeAction } from "./code.action";

/** A speaker's rotating code, on the talks' code screen with the speaker's own words. */
export function SpeakerCodeScreen({ speakerId, name }: { speakerId: string; name: string }) {
  // The screen asks by the id it shows; for a speaker that id is the speaker's.
  const issue = useCallback((input: { checkpointId: string }) => issueSpeakerCodeAction({ speakerId: input.checkpointId }), []);
  return <QrDisplay checkpointId={speakerId} name={name} issue={issue} texts={copy.admin.speakers.qr} />;
}
