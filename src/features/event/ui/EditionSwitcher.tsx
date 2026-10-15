"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, SelectField } from "@/shared/ui";
import type { EditionChoice } from "../domain/editions";
import type { ChooseEditionAction } from "./actions";

const t = copy.editions;
const stageName = (choice: EditionChoice) => copy.admin.events.stage[choice.stage];
export const choiceName = (choice: EditionChoice) => choice.name ?? choice.id;

export interface EditionSwitcherProps {
  choices: readonly EditionChoice[];
  /** The edition the control center works in now. */
  current: EditionChoice;
  choose: ChooseEditionAction;
}

/**
 * The control center's edition picker, under the brand. With a single edition it only names it. Picking one saves
 * the choice on the server and reloads the screen with that edition's data; the cadets' edition does not change.
 */
export function EditionSwitcher({ choices, current, choose }: EditionSwitcherProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (choices.length <= 1) {
    return (
      <div className="gap-space-1 flex flex-col">
        <p className="type-caption text-text-subtle">{t.switchLabel}</p>
        <p className="type-label text-foreground">{choiceName(current)}</p>
      </div>
    );
  }

  async function pick(id: string) {
    if (id === current.id) return;
    setPending(true);
    setError(null);
    const result = await choose({ id }).catch(() => ({ ok: false as const, code: "unknown" as const }));
    setPending(false);
    if (!result.ok) {
      setError(t.errors[result.code]);
      return;
    }
    router.refresh();
  }

  return (
    <SelectField
      label={t.switchLabel}
      hint={pending ? t.switching : t.switchHint}
      error={error}
      value={current.id}
      disabled={pending}
      options={choices.map((choice) => ({ value: choice.id, label: interpolate(t.option, { name: choiceName(choice), stage: stageName(choice) }) }))}
      onChange={(event) => void pick(event.target.value)}
    />
  );
}

export interface WorkingEditionNoticeProps {
  current: EditionChoice;
  /** The edition cadets, staff and the stage use. */
  live: EditionChoice | null;
  choose: ChooseEditionAction;
}

/** Shown above every control center screen while the edition being prepared is not the one in course. */
export function WorkingEditionNotice({ current, live, choose }: WorkingEditionNoticeProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (current.isPublic) return null;

  return (
    <div role="note" className="gap-space-3 border-violet bg-violet/10 p-space-3 mb-space-6 flex flex-wrap items-center justify-between rounded-md border">
      <p className="type-body-sm text-foreground min-w-0 flex-1 basis-64">
        {interpolate(t.workingNotice, { name: choiceName(current), stage: stageName(current).toLowerCase(), public: live ? choiceName(live) : "—" })}
      </p>
      {live ? (
        <Button
          variant="ghost"
          size="sm"
          loading={pending}
          onClick={async () => {
            setPending(true);
            const result = await choose({ id: live.id }).catch(() => ({ ok: false as const }));
            setPending(false);
            if (result.ok) router.refresh();
          }}
        >
          {t.backToPublic}
        </Button>
      ) : null}
    </div>
  );
}
