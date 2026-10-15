"use client";

import { useRouter } from "next/navigation";
import { copy } from "@/shared/copy/es";
import { ROUTES } from "@/shared/config/routes";
import { Button, Icon, InlineAlert } from "@/shared/ui";
import { useSignOut } from "./use-auth-flow";

export interface SignOutButtonProps {
  /**
   * "button" (default): a full-width button with its label. "icon": a 48 px icon button for a screen's header; a
   * failure shows in a small alert under it.
   */
  variant?: "button" | "icon";
}

/** Closes the session on the server and the client, then returns to the login screen. */
export function SignOutButton({ variant = "button" }: SignOutButtonProps) {
  const router = useRouter();
  const { status, errorCode, run } = useSignOut();
  const pending = status === "pending" || status === "success";
  const failure = errorCode && errorCode !== "cancelled" ? copy.auth.errors[errorCode] : null;

  async function handleSignOut() {
    const finished = await run();
    if (finished) {
      router.replace(ROUTES.login);
      router.refresh();
    }
  }

  if (variant === "icon") {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={pending}
          aria-label={pending ? copy.auth.signingOut : copy.auth.signOut}
          title={copy.auth.signOut}
          className="border-line-strong bg-bg-deep text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:ring-ring inline-grid size-12 place-items-center rounded-md border focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-70"
        >
          <Icon name={pending ? "loading" : "logout"} size={22} className={pending ? "animate-spin" : undefined} />
        </button>
        {failure ? (
          <div className="mt-space-2 absolute right-0 z-20 w-64">
            <InlineAlert>{failure}</InlineAlert>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="gap-space-3 flex flex-col">
      {failure ? <InlineAlert>{failure}</InlineAlert> : null}
      <Button variant="secondary" block loading={pending} onClick={handleSignOut}>
        {pending ? copy.auth.signingOut : copy.auth.signOut}
      </Button>
    </div>
  );
}
