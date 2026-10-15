"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { ROUTES } from "@/shared/config/routes";
import { BrandMark, Button, Card, InlineAlert, TextField } from "@/shared/ui";
import { ALIAS_MAX_LENGTH, createAlias, type AliasErrorCode } from "../domain/alias";
import type { AttendeeErrorCode } from "../domain/attendee-error";
import type { RegisterAttendeeAction } from "./registration";
import { useAttendeeRegistration } from "./use-attendee-registration";

/** The compiler checks that every alias rule has a message. */
const ALIAS_MESSAGES: Record<AliasErrorCode, string> = copy.onboarding.aliasErrors;

type GeneralErrorCode = keyof typeof copy.onboarding.errors;

function generalMessage(code: AttendeeErrorCode | null): string | null {
  if (code === null || code === "alias-invalid" || code === "alias-taken") return null;
  return copy.onboarding.errors[code as GeneralErrorCode];
}

/**
 * Onboarding view: a single field for the attendee alias.
 * States: empty, typing, invalid (client rule, shown after the first blur or submit), pending
 * (button busy, field read-only), alias rejected by the server (taken or reserved, on the field),
 * general failure (alert above the button). The server stays the authority: client checks only
 * save a round trip.
 */
export function OnboardingForm({
  register,
  nextPath = ROUTES.dashboard,
}: {
  register: RegisterAttendeeAction;
  /** Where to go once registered; the app shell decides it (for example the squad reveal). */
  nextPath?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { status, errorCode, aliasError, submit } = useAttendeeRegistration(register);

  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [submittedAlias, setSubmittedAlias] = useState<string | null>(null);

  const pending = status === "pending" || status === "success";
  const trimmed = value.trim();

  const clientCheck = createAlias(value);
  const clientError = touched && !clientCheck.ok ? ALIAS_MESSAGES[clientCheck.error] : null;

  // A server rejection belongs to the alias that was sent; once the user edits it, it no longer applies.
  const serverApplies = submittedAlias !== null && submittedAlias === trimmed;
  const serverError = !serverApplies
    ? null
    : errorCode === "alias-taken"
      ? copy.onboarding.aliasTaken
      : errorCode === "alias-invalid" && aliasError
        ? ALIAS_MESSAGES[aliasError]
        : null;

  const fieldError = clientError ?? serverError;
  const alert = generalMessage(errorCode);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setTouched(true);

    if (!clientCheck.ok) {
      inputRef.current?.focus();
      return;
    }

    setSubmittedAlias(trimmed);
    const finished = await submit(value);
    if (finished) {
      router.replace(nextPath);
      router.refresh();
      return;
    }
    inputRef.current?.focus();
  }

  return (
    <Card tone="cyan" className="gap-space-6 flex flex-col">
      <BrandMark />
      <div className="gap-space-2 flex flex-col">
        <h1 className="type-title text-foreground">{copy.onboarding.title}</h1>
        <p className="type-body text-muted-foreground">{copy.onboarding.subtitle}</p>
      </div>
      <form noValidate onSubmit={handleSubmit} className="gap-space-4 flex flex-col">
        <TextField
          ref={inputRef}
          name="alias"
          label={copy.onboarding.aliasLabel}
          hint={copy.onboarding.aliasHint}
          placeholder={copy.onboarding.aliasPlaceholder}
          error={fieldError}
          counter={{ current: [...value].length, max: ALIAS_MAX_LENGTH }}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => setTouched(true)}
          readOnly={pending}
          maxLength={ALIAS_MAX_LENGTH}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
        />
        {alert ? <InlineAlert>{alert}</InlineAlert> : null}
        <Button type="submit" block size="lg" loading={pending}>
          {pending ? copy.onboarding.submitting : copy.onboarding.submit}
        </Button>
      </form>
    </Card>
  );
}
