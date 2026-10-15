"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Card, Icon, InlineAlert, MedalArt, SortableList } from "@/shared/ui";
import type { Badge } from "../domain/badge";
import type { AchievementAdminActionResult, MoveBadgeAction, SeedBadgesAction, SetBadgeActiveAction } from "./admin-actions";
import { ruleText, type RuleNames } from "./rule-text";

export interface BadgesAdminViewProps {
  badges: readonly Badge[];
  /** Names of the quadrants and missions the rules point at. */
  names: RuleNames;
  defaultsCount: number;
  seed: SeedBadgesAction;
  setActive: SetBadgeActiveAction;
  move: MoveBadgeAction;
  /** Plain paths (a client component cannot receive functions from the server). */
  hrefs: { create: string; editBase: string };
}

const chip = "type-caption border-line-strong text-foreground px-space-3 rounded-full border py-1";

/**
 * The Logros screen: every badge of the edition in order, with its medal, rule and state, a handle to
 * drag it to another place, and buttons to edit and activate or deactivate it. An empty edition offers the bundled set.
 */
export function BadgesAdminView({ badges, names, defaultsCount, seed, setActive, move, hrefs }: BadgesAdminViewProps) {
  const t = copy.admin.achievements;
  const router = useRouter();
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<AchievementAdminActionResult>, success?: string) {
    setBusy(key);
    setNotice(null);
    let result: AchievementAdminActionResult;
    try {
      result = await action();
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);
    if (!result.ok) {
      setNotice({ kind: "error", text: t.errors[result.code] });
      return false;
    }
    if (success) setNotice({ kind: "success", text: success });
    router.refresh();
    return true;
  }

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-3 flex flex-wrap items-end justify-between">
        <div className="gap-space-1 flex flex-col">
          <h1 className="type-title-xl text-foreground">{t.title}</h1>
          <p className="type-body text-muted-foreground">{t.subtitle}</p>
        </div>
        {badges.length > 0 ? <ButtonLink href={hrefs.create}>{t.create}</ButtonLink> : null}
      </header>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      {badges.length === 0 ? (
        <Card className="gap-space-4 flex flex-col">
          <p className="type-body text-muted-foreground">{interpolate(t.usingDefaults, { n: String(defaultsCount) })}</p>
          <Button loading={busy === "seed"} disabled={busy !== null} onClick={() => void run("seed", seed, t.seeded)}>
            {busy === "seed" ? t.seeding : t.seed}
          </Button>
          <ButtonLink href={hrefs.create} variant="ghost">
            {t.create}
          </ButtonLink>
        </Card>
      ) : (
        <SortableList
          items={badges}
          getId={(badge) => badge.id}
          getLabel={(badge) => badge.name}
          label={t.listLabel}
          disabled={busy !== null}
          onMove={(id, to) => run(`move:${id}`, () => move({ id, to }))}
          renderItem={(badge, handle) => {
            const label = (action: string) => `${action}: ${badge.name}`;
            return (
                <Card pad={false} className={cn("gap-space-3 p-space-3 flex flex-col", !badge.active && "opacity-75")}>
                  <div className="gap-space-3 flex items-start">
                    {handle}
                    <MedalArt tone={badge.tone} imageUrl={badge.image?.url} locked={!badge.active} scale={3} className="shrink-0" />
                    <div className="gap-space-1 flex min-w-0 flex-1 flex-col">
                      <p className="type-label text-foreground">{badge.name}</p>
                      <p className="type-caption text-muted-foreground">{ruleText(badge.rule, names)}</p>
                      <p className="type-body-sm text-muted-foreground line-clamp-2">{badge.description}</p>
                    </div>
                    <span className={cn(chip, "shrink-0", badge.active ? "border-accent/70" : "text-text-subtle")}>{badge.active ? t.active : t.inactive}</span>
                  </div>
                  <div className="gap-space-2 flex flex-wrap items-center justify-end">
                    <Link
                      href={`${hrefs.editBase}/${badge.id}`}
                      aria-label={label(t.edit)}
                      className="type-label text-primary hover:bg-secondary focus-visible:ring-ring px-space-4 gap-space-2 inline-flex h-9 items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
                    >
                      <Icon name="edit" size={16} />
                      {t.edit}
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      aria-label={label(badge.active ? t.deactivate : t.activate)}
                      onClick={() =>
                        void run(
                          `active:${badge.id}`,
                          () => setActive({ id: badge.id, active: !badge.active }),
                          interpolate(badge.active ? t.deactivatedDone : t.activatedDone, { name: badge.name }),
                        )
                      }
                    >
                      {badge.active ? t.deactivate : t.activate}
                    </Button>
                  </div>
                </Card>
            );
          }}
        />
      )}
    </div>
  );
}
