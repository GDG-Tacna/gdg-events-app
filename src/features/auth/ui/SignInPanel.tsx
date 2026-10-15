"use client";

import { useRouter } from "next/navigation";
import { copy } from "@/shared/copy/es";
import { ROUTES } from "@/shared/config/routes";
import {
  ArtTile,
  BrandMark,
  Button,
  Card,
  GoogleMark,
  InlineAlert,
  PixelShip,
} from "@/shared/ui";
import type { AuthErrorCode } from "../domain/auth-error";
import { useGoogleSignIn } from "./use-auth-flow";

/** `cancelled` has no message on purpose: closing the Google popup is a choice, not a failure. */
function messageFor(code: AuthErrorCode | null): string | null {
  if (code === null || code === "cancelled") return null;
  return copy.auth.errors[code];
}

/**
 * Login view. States: idle, pending (button busy, label changes), error (alert above the button),
 * cancelled (back to idle, no message). The loading skeleton lives in the route's `loading.tsx`.
 */
export function SignInPanel() {
  const router = useRouter();
  const { status, errorCode, run } = useGoogleSignIn();
  const pending = status === "pending" || status === "success";
  const message = messageFor(errorCode);

  async function handleSignIn() {
    const finished = await run();
    if (finished) router.replace(ROUTES.afterSignIn);
  }

  return (
    <Card tone="cyan" className="gap-space-6 flex flex-col">
      <BrandMark />
      <div className="flex justify-center">
        <ArtTile>
          <PixelShip scale={4} title={copy.auth.shipName} />
        </ArtTile>
      </div>
      <div className="gap-space-2 flex flex-col">
        <h1 className="type-title text-foreground">{copy.auth.title}</h1>
        <p className="type-body text-muted-foreground">{copy.auth.subtitle}</p>
      </div>
      {message ? <InlineAlert>{message}</InlineAlert> : null}
      <Button
        block
        size="lg"
        variant="secondary"
        loading={pending}
        leading={<GoogleMark />}
        onClick={handleSignIn}
      >
        {pending ? copy.auth.signingIn : copy.auth.signIn}
      </Button>
    </Card>
  );
}
