"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Button, ButtonLink, Card, InlineAlert, SelectField, TextAreaField, TextField, useConfirm } from "@/shared/ui";
import { BAN_REASON_MAX } from "../domain/manage";
import type { BanCadetAction, CadetActionResult, CadetDetailData, ChangeCadetSquadAction, DeleteCadetAction, RenameCadetAction, UnbanCadetAction } from "./actions";

export interface CadetDetailViewProps {
  cadet: CadetDetailData;
  /** The edition's squads, to move the cadet between them. */
  squads: ReadonlyArray<{ id: string; name: string }>;
  rename: RenameCadetAction;
  changeSquad: ChangeCadetSquadAction;
  ban: BanCadetAction;
  unban: UnbanCadetAction;
  remove: DeleteCadetAction;
  /** Whether the session may delete cadets (only an admin of every edition); the server decides again. */
  canDelete: boolean;
  /** Whether the session may change cadets (edit level in the section); without it the page only shows. */
  canEdit: boolean;
  /** Whether this cadet is the one looking (they cannot block or delete themselves). */
  isSelf: boolean;
  /** Plain path of the list, where deleting leads. */
  listHref: string;
}

type Notice = { kind: "success" | "error"; text: string } | null;

const NO_SQUAD = "";
const date = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" });
const when = (value: string | null) => (value ? date.format(new Date(value)) : null);

/**
 * One cadet's page: who they are and what they did in the edition, and what an admin can do about it: change their
 * alias or squad, block them (their account is disabled and their sessions end) and, for an admin of every edition,
 * delete them. Every change is a server command; this screen shows the answer.
 */
export function CadetDetailView({ cadet, squads, rename, changeSquad, ban, unban, remove, canDelete, canEdit, isSelf, listHref }: CadetDetailViewProps) {
  const t = copy.admin.cadets;
  const router = useRouter();
  const [alias, setAlias] = useState(cadet.alias);
  const [squad, setSquad] = useState(cadet.squad ?? NO_SQUAD);
  const [reason, setReason] = useState("");
  const [confirmAlias, setConfirmAlias] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const [notice, setNotice] = useState<Notice>(null);

  async function run(key: string, action: () => Promise<CadetActionResult>, success: string): Promise<boolean> {
    setBusy(key);
    setNotice(null);
    let result: CadetActionResult;
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
    setNotice({ kind: "success", text: success });
    router.refresh();
    return true;
  }

  const saveAlias = (event: FormEvent) => {
    event.preventDefault();
    if (busy === null) void run("rename", () => rename({ uid: cadet.uid, alias }), t.renamedDone);
  };
  const saveSquad = (event: FormEvent) => {
    event.preventDefault();
    if (busy === null) void run("squad", () => changeSquad({ uid: cadet.uid, squad: squad === NO_SQUAD ? null : squad }), t.squadDone);
  };
  const submitBan = async (event: FormEvent) => {
    event.preventDefault();
    if (busy !== null) return;
    const yes = await confirm({ title: interpolate(t.confirmBanTitle, { alias: cadet.alias }), description: t.confirmBan, confirmLabel: t.ban });
    if (!yes) return;
    if (await run("ban", () => ban({ uid: cadet.uid, reason }), interpolate(t.bannedDone, { alias: cadet.alias }))) setReason("");
  };
  async function submitDelete(event: FormEvent) {
    event.preventDefault();
    if (busy !== null) return;
    setBusy("delete");
    setNotice(null);
    let result: Awaited<ReturnType<DeleteCadetAction>>;
    try {
      result = await remove({ uid: cadet.uid });
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);
    if (!result.ok) return setNotice({ kind: "error", text: t.errors[result.code] });
    router.push(listHref);
    router.refresh();
  }

  const squadOptions = [{ value: NO_SQUAD, label: t.noSquad }, ...squads.map((option) => ({ value: option.id, label: option.name }))];
  // A squad the cadet has that the edition no longer lists still shows, so the select never lies about it.
  if (cadet.squad && !squads.some((option) => option.id === cadet.squad)) squadOptions.push({ value: cadet.squad, label: cadet.squad });
  const aliasChanged = alias.trim() !== cadet.alias;
  const squadChanged = squad !== (cadet.squad ?? NO_SQUAD);
  const mayDeleteNow = canDelete && !isSelf;

  return (
    <div className="gap-space-5 flex flex-col">
      <div>
        <ButtonLink href={listHref} variant="ghost" size="sm" className="-ml-space-4">
          {t.back}
        </ButtonLink>
      </div>

      <header className="gap-space-1 flex flex-col">
        <h1 className="type-title-xl text-foreground">{cadet.alias}</h1>
        <p className="type-body text-muted-foreground">
          {cadet.squadName ?? t.noSquad} · {interpolate(t.xp, { xp: formatNumber(cadet.xp) })} · {interpolate(t.credits, { n: formatNumber(cadet.credits) })}
        </p>
        {cadet.banned ? <p className="type-label text-danger">{t.banned}</p> : null}
      </header>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      <Card className="gap-space-3 flex flex-col">
        <h2 className="type-heading text-foreground">{t.infoTitle}</h2>
        <dl className="gap-space-2 type-body-sm grid grid-cols-[auto_1fr]">
          <dt className="text-text-subtle">{t.email}</dt>
          <dd className="text-foreground break-all">{cadet.account?.email ?? t.unknown}</dd>
          <dt className="text-text-subtle">{t.name}</dt>
          <dd className="text-foreground">{cadet.account?.displayName ?? t.unknown}</dd>
          <dt className="text-text-subtle">{t.registered}</dt>
          <dd className="text-foreground">{when(cadet.createdAt) ?? t.unknown}</dd>
          <dt className="text-text-subtle">{t.arrival}</dt>
          <dd className="text-foreground">{when(cadet.attendedAt) ?? t.notArrived}</dd>
          <dt className="text-text-subtle">{t.activityTitle}</dt>
          <dd className="text-foreground">
            {interpolate(t.activity, {
              checkIns: String(cadet.activity.checkIns),
              missions: String(cadet.activity.missions),
              badges: String(cadet.activity.badges),
              contacts: String(cadet.activity.contacts),
            })}
          </dd>
          <dt className="text-text-subtle">{t.uid}</dt>
          <dd className="text-text-subtle break-all">{cadet.uid}</dd>
        </dl>
      </Card>

      {canEdit ? (
        <>
          <Card>
            <form onSubmit={saveAlias} noValidate className="gap-space-3 flex flex-col">
              <h2 className="type-heading text-foreground">{t.aliasTitle}</h2>
              <TextField label={t.aliasLabel} hint={t.aliasHint} value={alias} maxLength={32} autoComplete="off" readOnly={busy !== null} onChange={(event) => setAlias(event.target.value)} />
              <Button type="submit" loading={busy === "rename"} disabled={busy !== null || !aliasChanged}>
                {t.saveAlias}
              </Button>
            </form>
          </Card>

          <Card>
            <form onSubmit={saveSquad} noValidate className="gap-space-3 flex flex-col">
              <h2 className="type-heading text-foreground">{t.squadTitle}</h2>
              <SelectField label={t.squadLabel} hint={t.squadHint} options={squadOptions} value={squad} disabled={busy !== null} onChange={(event) => setSquad(event.target.value)} />
              <Button type="submit" loading={busy === "squad"} disabled={busy !== null || !squadChanged}>
                {t.saveSquad}
              </Button>
            </form>
          </Card>

          <Card className="gap-space-3 flex flex-col">
            <h2 className="type-heading text-foreground">{t.banTitle}</h2>
            {cadet.banned ? (
              <>
                <p className="type-body-sm text-muted-foreground">
                  {interpolate(t.bannedSince, { when: when(cadet.bannedAt) ?? t.unknown })}
                  {cadet.banReason ? ` ${interpolate(t.bannedReason, { reason: cadet.banReason })}` : ""}
                </p>
                <Button variant="secondary" loading={busy === "unban"} disabled={busy !== null} onClick={() => void run("unban", () => unban({ uid: cadet.uid }), interpolate(t.unbannedDone, { alias: cadet.alias }))}>
                  {t.unban}
                </Button>
              </>
            ) : isSelf ? (
              <p className="type-body-sm text-muted-foreground">{t.errors["own-account"]}</p>
            ) : (
              <form onSubmit={(event) => void submitBan(event)} noValidate className="gap-space-3 flex flex-col">
                <p className="type-body-sm text-muted-foreground">{t.banHelp}</p>
                <TextAreaField
                  label={t.reasonLabel}
                  value={reason}
                  maxLength={BAN_REASON_MAX}
                  rows={3}
                  counter={{ current: reason.length, max: BAN_REASON_MAX }}
                  readOnly={busy !== null}
                  onChange={(event) => setReason(event.target.value)}
                />
                <Button type="submit" variant="secondary" loading={busy === "ban"} disabled={busy !== null || reason.trim().length < 3}>
                  {t.ban}
                </Button>
              </form>
            )}
          </Card>
        </>
      ) : null}

      {mayDeleteNow ? (
        <Card className="gap-space-3 border-danger/60 flex flex-col border">
          <form onSubmit={(event) => void submitDelete(event)} noValidate className="gap-space-3 flex flex-col">
            <h2 className="type-heading text-danger">{t.deleteTitle}</h2>
            <p className="type-body-sm text-muted-foreground">{t.deleteHelp}</p>
            <TextField
              label={interpolate(t.deleteConfirmLabel, { alias: cadet.alias })}
              value={confirmAlias}
              autoComplete="off"
              readOnly={busy !== null}
              onChange={(event) => setConfirmAlias(event.target.value)}
            />
            <Button type="submit" variant="secondary" loading={busy === "delete"} disabled={busy !== null || confirmAlias.trim() !== cadet.alias}>
              {t.delete}
            </Button>
          </form>
        </Card>
      ) : null}
      {dialog}
    </div>
  );
}
