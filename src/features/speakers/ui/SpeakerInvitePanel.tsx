"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignOutButton, useGoogleSignIn } from "@/features/auth";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { BrandMark, Button, Card, InlineAlert } from "@/shared/ui";
import type { SpeakerAccessErrorCode, SpeakerInviteState } from "../domain/access";
import type { AcceptSpeakerInviteAction } from "./actions";

export interface SpeakerInvitePanelProps {
  token: string;
  name: string;
  /** The invited email, half hidden. */
  maskedEmail: string;
  state: SpeakerInviteState;
  signedIn: boolean;
  accept: AcceptSpeakerInviteAction;
  /** Where the speaker's own code is shown. */
  homeHref: string;
}

const t = copy.speakerInvite;
type Problem = SpeakerAccessErrorCode | "signIn";

/**
 * A speaker's link: sign in with Google when needed, then the server links the account (it must be the invited email)
 * and the speaker lands on their own code. An accepted link opens the code again for the same account.
 */
export function SpeakerInvitePanel({ token, name, maskedEmail, state, signedIn, accept, homeHref }: SpeakerInvitePanelProps) {
  const router = useRouter();
  const signIn = useGoogleSignIn();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(state === "expired" ? "expired" : null);
  const [hasSession, setHasSession] = useState(signedIn);
  const shown: Problem | null = problem ?? (signIn.status === "error" ? "signIn" : null);

  async function run() {
    setPending(true);
    setProblem(null);
    // A closed Google window is a choice, not an error; a failed sign-in shows through the hook's state.
    if (!hasSession && !(await signIn.run())) {
      setPending(false);
      return;
    }
    setHasSession(true);
    let result;
    try {
      result = await accept({ token });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    if (!result.ok) {
      setPending(false);
      setProblem(result.code);
      return;
    }
    router.replace(homeHref);
    router.refresh();
  }

  return (
    <Card tone="cyan" className="gap-space-5 flex flex-col">
      <BrandMark />
      <div className="gap-space-2 flex flex-col">
        <h1 className="type-title text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{interpolate(t.intro, { name, email: maskedEmail })}</p>
      </div>
      {shown ? <InlineAlert>{t.errors[shown]}</InlineAlert> : null}
      {state === "expired" ? null : (
        <Button size="lg" block icon="login" loading={pending} onClick={() => void run()}>
          {pending ? t.accepting : hasSession ? t.accept : t.signInAndAccept}
        </Button>
      )}
      {hasSession && (problem === "wrong-account" || problem === "used" || problem === "already-linked") ? <SignOutButton /> : null}
    </Card>
  );
}
