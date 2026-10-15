"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { Button, Card, InlineAlert } from "@/shared/ui";
import type { EditionChoice } from "../domain/editions";
import type { ChooseEditionAction } from "./actions";
import { choiceName } from "./EditionSwitcher";

const t = copy.editions;

export interface MyEditionsViewProps {
  /** The editions where this person is in the team, with their role there. */
  entries: ReadonlyArray<{ edition: EditionChoice; role: "staff" | "organizer" }>;
  choose: ChooseEditionAction;
  /** Where the control center starts. */
  adminHref: string;
}

/**
 * For a staff or organizer whose role belongs to an edition not in course: an organizer opens the control center on
 * that edition to prepare it; staff wait until it is in course (they scan on the event day). Nobody here is signed up
 * as a cadet by mistake.
 */
export function MyEditionsView({ entries, choose, adminHref }: MyEditionsViewProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function work(id: string) {
    setBusy(id);
    setError(null);
    const result = await choose({ id }).catch(() => ({ ok: false as const, code: "unknown" as const }));
    if (!result.ok) {
      setBusy(null);
      setError(t.errors[result.code]);
      return;
    }
    router.push(adminHref);
  }

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title text-foreground">{t.mine.title}</h1>
        <p className="type-body text-muted-foreground">{t.mine.subtitle}</p>
      </header>
      {error ? <InlineAlert>{error}</InlineAlert> : null}
      <ul className="gap-space-3 flex flex-col">
        {entries.map(({ edition, role }) => (
          <li key={edition.id}>
            <Card className="gap-space-3 flex flex-col">
              <div className="gap-space-1 flex flex-col">
                <p className="type-label text-foreground">{choiceName(edition)}</p>
                <p className="type-caption text-text-subtle">
                  {t.mine.roles[role]} · {copy.admin.events.stage[edition.stage]}
                </p>
              </div>
              {role === "organizer" ? (
                <Button className="self-start" loading={busy === edition.id} disabled={busy !== null} onClick={() => void work(edition.id)}>
                  {busy === edition.id ? t.mine.working : t.mine.work}
                </Button>
              ) : (
                <p className="type-body-sm text-muted-foreground">{t.mine.staffWaiting}</p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
