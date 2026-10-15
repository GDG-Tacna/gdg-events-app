"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ImageField, type ImageRef, type UploadImageAction } from "@/features/media";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, Card, InlineAlert, TextField } from "@/shared/ui";
import { RANKS_MAX, RANK_NAME_MAX, rankLadderProblems } from "../domain/rank";
import type { SaveRanksAction } from "./ranks-action";

export interface RanksEditorProps {
  ranks: ReadonlyArray<{ id: string; name: string; minXp: number; icon?: ImageRef | null }>;
  /** True while the edition has no ladder of its own. */
  isDefault: boolean;
  save: SaveRanksAction;
  /** Uploads a rank's icon. */
  upload: UploadImageAction;
}

interface Row {
  id: string;
  name: string;
  xp: string;
  icon: ImageRef | null;
}

const xpOf = (row: Row) => (row.xp.trim() === "" ? Number.NaN : Number(row.xp));

/** A new rank's id: stable once saved (renaming keeps it), unique in the ladder. */
function newId(rows: readonly Row[]): string {
  const taken = new Set(rows.map((row) => row.id));
  let n = rows.length + 1;
  while (taken.has(`rank-${n}`)) n += 1;
  return `rank-${n}`;
}

/**
 * The Rangos screen: the ladder from the first rank to the last, each with its name and the XP it starts
 * at (the first always at 0). Ranks can be added and removed. Problems are pointed at before saving, with
 * the same rules as the server; saving reprices every attendee at once.
 */
export function RanksEditor({ ranks, isDefault, save, upload }: RanksEditorProps) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(ranks.map((rank) => ({ id: rank.id, name: rank.name, xp: String(rank.minXp), icon: rank.icon ?? null })));
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  const ladder = rows.map((row) => ({ id: row.id, name: row.name, minXp: xpOf(row) }));
  const problems = useMemo(() => rankLadderProblems(rows.map((row) => ({ id: row.id, name: row.name, minXp: xpOf(row) }))), [rows]);

  function change(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));
    setNotice(null);
  }

  function add() {
    const last = rows.at(-1);
    const xp = last && Number.isFinite(xpOf(last)) ? xpOf(last) + 100 : 0;
    setRows((current) => [...current, { id: newId(current), name: copy.admin.ranks.newRank, xp: String(xp), icon: null }]);
    setNotice(null);
  }

  async function submit() {
    if (problems.size > 0) {
      setShowProblems(true);
      return;
    }
    setPending(true);
    setNotice(null);
    let result;
    try {
      // The whole ladder is saved: each rank sends the icon it keeps, or null.
      result = await save(ladder.map((rank, index) => ({ ...rank, name: rank.name.trim(), iconPath: rows[index].icon?.path ?? null })));
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    setPending(false);
    if (!result.ok) {
      setNotice({ kind: "error", text: copy.admin.ranks.errors[result.code] });
      return;
    }
    setShowProblems(false);
    setNotice({ kind: "success", text: copy.admin.ranks.saved });
    router.refresh();
  }

  const problemList = [...problems.entries()].flatMap(([index, list]) =>
    list.map((problem) => ({
      key: `${index}-${problem}`,
      text: index < 0 ? copy.admin.ranks.problems.count : interpolate(copy.admin.ranks.problems[problem], { n: String(index + 1) }),
    })),
  );

  return (
    <div className="gap-space-5 flex flex-col">
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title-xl text-foreground">{copy.admin.ranks.title}</h1>
        <p className="type-body text-muted-foreground">{copy.admin.ranks.subtitle}</p>
        {isDefault ? <p className="type-body-sm text-foreground">{copy.admin.ranks.defaultNote}</p> : null}
      </header>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}
      {showProblems && problemList.length > 0 ? (
        <div role="alert" className="border-danger/60 bg-danger/10 p-space-3 gap-space-2 flex flex-col rounded-md border">
          <p className="type-label text-foreground">{copy.admin.ranks.problemsTitle}</p>
          <ul className="type-body-sm text-foreground list-disc pl-5">
            {problemList.map((problem) => (
              <li key={problem.key}>{problem.text}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ol aria-label={copy.admin.ranks.listLabel} className="gap-space-3 flex flex-col">
        {rows.map((row, index) => {
          const n = String(index + 1);
          const rowProblems = showProblems ? (problems.get(index) ?? []) : [];
          const nameProblem = rowProblems.find((problem) => problem === "name" || problem === "id");
          const xpProblem = rowProblems.find((problem) => problem === "xp" || problem === "not-rising" || problem === "first-not-zero");
          return (
            <li key={row.id}>
              <Card className="gap-space-3 flex flex-col min-[640px]:flex-row min-[640px]:items-start">
                <span className="type-pixel-tag text-primary shrink-0 min-[640px]:mt-10">{interpolate(copy.admin.ranks.level, { n })}</span>
                <div className="gap-space-3 flex min-w-0 flex-1 flex-col">
                  <TextField
                    label={interpolate(copy.admin.ranks.name, { n })}
                    value={row.name}
                    maxLength={RANK_NAME_MAX}
                    autoComplete="off"
                    readOnly={pending}
                    error={nameProblem ? interpolate(copy.admin.ranks.problems[nameProblem], { n }) : null}
                    onChange={(event) => change(index, { name: event.target.value })}
                  />
                  <ImageField label={interpolate(copy.admin.ranks.icon, { n })} purpose="rank" value={row.icon} upload={upload} disabled={pending} onChange={(icon) => change(index, { icon })} />
                </div>
                <div className="min-[640px]:w-44">
                  <TextField
                    label={interpolate(copy.admin.ranks.xp, { n })}
                    hint={index === 0 ? copy.admin.ranks.firstFixed : undefined}
                    value={row.xp}
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="off"
                    readOnly={pending || index === 0}
                    error={xpProblem ? interpolate(copy.admin.ranks.problems[xpProblem], { n }) : null}
                    onChange={(event) => change(index, { xp: event.target.value.replace(/[^0-9]/g, "") })}
                  />
                </div>
                {index > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start min-[640px]:mt-8 min-[640px]:w-11"
                    disabled={pending}
                    aria-label={interpolate(copy.admin.ranks.remove, { n })}
                    onClick={() => {
                      setRows((current) => current.filter((_, at) => at !== index));
                      setNotice(null);
                    }}
                  >
                    ✕
                  </Button>
                ) : (
                  // The first rank cannot be removed: keep its fields aligned with the others.
                  <span aria-hidden="true" className="hidden shrink-0 min-[640px]:block min-[640px]:w-11" />
                )}
              </Card>
            </li>
          );
        })}
      </ol>

      <div className="gap-space-3 flex flex-col min-[520px]:flex-row">
        <Button type="button" variant="secondary" disabled={pending || rows.length >= RANKS_MAX} onClick={add}>
          {copy.admin.ranks.add}
        </Button>
        <Button type="button" size="lg" className="min-[520px]:ml-auto" loading={pending} onClick={() => void submit()}>
          {pending ? copy.admin.ranks.saving : copy.admin.ranks.save}
        </Button>
      </div>
    </div>
  );
}
