"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignOutButton, useAuthActions, useGoogleSignIn } from "@/features/auth";
import { homeFor } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { BrandMark, Button, Card, InlineAlert } from "@/shared/ui";
import type { InviteErrorCode, InviteState } from "../domain/invites";
import type { ManagedRole } from "../domain/team";
import type { AcceptInviteAction } from "./invite-actions";

export interface InviteAcceptPanelProps {
  secret: string;
  role: ManagedRole;
  /** The invited email, half hidden. */
  maskedEmail: string;
  state: InviteState;
  signedIn: boolean;
  accept: AcceptInviteAction;
}

const t = copy.invite;
type Problem = InviteErrorCode | "signIn";

/**
 * Accepting an invitation: sign in with Google when needed, then the server checks the link and the account's email
 * and gives the role; the session is renewed so the new role applies at once, and the person lands on its home.
 */
export function InviteAcceptPanel({ secret, role, maskedEmail, state, signedIn, accept }: InviteAcceptPanelProps) {
  const router = useRouter();
  const { refreshSession } = useAuthActions();
  const signIn = useGoogleSignIn();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(state === "pending" ? null : state === "accepted" ? "used" : state);
  const [done, setDone] = useState(false);
  // Signed in on this page counts too: a retry does not ask Google again, and another account can be chosen.
  const [hasSession, setHasSession] = useState(signedIn);
  const closed = state !== "pending";
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
      result = await accept({ secret });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    if (!result.ok) {
      setPending(false);
      setProblem(result.code);
      return;
    }
    setDone(true);
    await refreshSession();
    router.replace(homeFor(result.role));
    router.refresh();
  }

  return (
    <Card tone="cyan" className="gap-space-5 flex flex-col">
      <BrandMark />
      <div className="gap-space-2 flex flex-col">
        <h1 className="type-title text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{interpolate(t.intro, { role: t.roles[role], email: maskedEmail })}</p>
      </div>
      {shown ? <InlineAlert>{t.errors[shown]}</InlineAlert> : null}
      {done ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {t.done}
        </p>
      ) : null}
      {closed || done ? null : (
        <Button size="lg" block icon="login" loading={pending} onClick={() => void run()}>
          {pending ? t.accepting : hasSession ? t.accept : t.signInAndAccept}
        </Button>
      )}
      {hasSession && problem === "wrong-account" ? <SignOutButton /> : null}
    </Card>
  );
}
