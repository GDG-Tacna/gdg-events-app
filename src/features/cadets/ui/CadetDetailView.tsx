"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TICKET_TYPES, TicketChip, ticketName, type ChangeCadetTicketAction, type TicketActionResult, type TicketsErrorCode, type TicketType } from "@/features/tickets";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Button, ButtonLink, Card, InlineAlert, SelectField, TextAreaField, TextField, useConfirm } from "@/shared/ui";
import { BAN_REASON_MAX, type CadetsErrorCode } from "../domain/manage";
import type { BanCadetAction, CadetActionResult, CadetDetailData, CadetTeamControls, CadetTeamRole, ChangeCadetSquadAction, DeleteCadetAction, RenameCadetAction, TeamRoleActionResult, UnbanCadetAction } from "./actions";

export interface CadetDetailViewProps {
  cadet: CadetDetailData;
  /** The edition's squads, to move the cadet between them. */
  squads: ReadonlyArray<{ id: string; name: string }>;
  rename: RenameCadetAction;
  changeSquad: ChangeCadetSquadAction;
  /** Sets the cadet's ticket by hand. */
  changeTicket: ChangeCadetTicketAction;
  ban: BanCadetAction;
  unban: UnbanCadetAction;
  remove: DeleteCadetAction;
  /** Whether the session may delete cadets (only an admin of every edition); the server decides again. */
  canDelete: boolean;
  /** Whether the session may change cadets (edit level in the section); without it the page only shows. */
  canEdit: boolean;
  /** Giving and taking a team role; without it the page does not offer it (the viewer may not manage the team). */
  team?: CadetTeamControls;
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
export function CadetDetailView({ cadet, squads, rename, changeSquad, changeTicket, ban, unban, remove, team, canDelete, canEdit, isSelf, listHref }: CadetDetailViewProps) {
  const t = copy.admin.cadets;
  const router = useRouter();
  const [alias, setAlias] = useState(cadet.alias);
  const [squad, setSquad] = useState(cadet.squad ?? NO_SQUAD);
  const [ticket, setTicket] = useState<TicketType>(cadet.ticket);
  const [reason, setReason] = useState("");
  const [confirmAlias, setConfirmAlias] = useState("");
  const [roleToGive, setRoleToGive] = useState<CadetTeamRole | "">(team?.assignable.find((option) => option !== team.role) ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const [notice, setNotice] = useState<Notice>(null);

  async function run(key: string, action: () => Promise<CadetActionResult | TicketActionResult>, success: string): Promise<boolean> {
    setBusy(key);
    setNotice(null);
    let result: CadetActionResult | TicketActionResult;
    try {
      result = await action();
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);
    if (!result.ok) {
      // The ticket and the cadet commands share some codes (forbidden, not-found...): each has its own wording.
      setNotice({ kind: "error", text: key === "ticket" ? copy.tickets.errors[result.code as TicketsErrorCode] : t.errors[result.code as CadetsErrorCode] });
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
  const saveTicket = (event: FormEvent) => {
    event.preventDefault();
    if (busy === null) void run("ticket", () => changeTicket({ uid: cadet.uid, type: ticket }), t.ticketDone);
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

  /** Gives or takes a team role with the Equipo screen's own actions; the email is the cadet's account. */
  async function changeTeamRole(kind: "give" | "take"): Promise<void> {
    const email = cadet.account?.email;
    if (!team || !email || busy !== null) return;
    const role = kind === "give" ? roleToGive : null;
    if (kind === "give" && !role) return;
    const roleName = role ? copy.admin.team.roles[role] : "";
    const yes = await confirm(
      kind === "give"
        ? { title: interpolate(t.team.confirmGiveTitle, { alias: cadet.alias, role: roleName }), description: role === "admin" ? t.team.confirmGiveAdmin : t.team.confirmGive, confirmLabel: t.team.confirmGiveButton }
        : { title: interpolate(t.team.confirmTakeTitle, { alias: cadet.alias }), description: t.team.confirmTake, confirmLabel: t.team.confirmTakeButton, tone: "danger" },
    );
    if (!yes) return;
    const success = kind === "give" ? interpolate(t.team.givenDone, { alias: cadet.alias, role: roleName }) : interpolate(t.team.takenDone, { alias: cadet.alias });
    setBusy(kind === "give" ? "team-give" : "team-take");
    setNotice(null);
    let result: TeamRoleActionResult;
    try {
      result = kind === "give" && role ? await team.give({ email, role }) : await team.take({ email });
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);
    if (!result.ok) {
      const errors = copy.admin.team.errors as Record<string, string>;
      return setNotice({ kind: "error", text: errors[result.code] ?? errors.unknown });
    }
    setNotice({ kind: "success", text: success });
    router.refresh();
  }

  const squadOptions = [{ value: NO_SQUAD, label: t.noSquad }, ...squads.map((option) => ({ value: option.id, label: option.name }))];
  // A squad the cadet has that the edition no longer lists still shows, so the select never lies about it.
  if (cadet.squad && !squads.some((option) => option.id === cadet.squad)) squadOptions.push({ value: cadet.squad, label: cadet.squad });
  const aliasChanged = alias.trim() !== cadet.alias;
  const squadChanged = squad !== (cadet.squad ?? NO_SQUAD);
  const ticketChanged = ticket !== cadet.ticket;
  const ticketOptions = TICKET_TYPES.map((value) => ({ value, label: ticketName(value) }));
  const ticketSource =
    cadet.ticketSource === "manual" ? (cadet.ticketSetByName ? interpolate(copy.tickets.sources.manual, { name: cadet.ticketSetByName }) : copy.tickets.sources.manualUnknown) : copy.tickets.sources[cadet.ticketSource];
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
        <div className="mt-space-1 flex">
          <TicketChip type={cadet.ticket} />
        </div>
        {cadet.banned ? <p className="type-label text-danger-ink">{t.banned}</p> : null}
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

          {team ? (
            <Card className="gap-space-3 flex flex-col">
              <h2 className="type-heading text-foreground">{t.team.title}</h2>
              <p className="type-body-sm text-muted-foreground">{t.team.help}</p>
              <p className="type-label text-foreground">{interpolate(t.team.current, { role: team.role ? copy.admin.team.roles[team.role] : t.team.none })}</p>
              {isSelf ? (
                <p className="type-body-sm text-muted-foreground">{t.team.ownAccount}</p>
              ) : !cadet.account?.email ? (
                <p className="type-body-sm text-muted-foreground">{t.team.noEmail}</p>
              ) : (
                <>
                  {team.assignable.filter((option) => option !== team.role).length > 0 ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void changeTeamRole("give");
                      }}
                      noValidate
                      className="gap-space-3 flex flex-col"
                    >
                      <SelectField
                        label={t.team.roleLabel}
                        options={team.assignable.filter((option) => option !== team.role).map((option) => ({ value: option, label: copy.admin.team.roles[option] }))}
                        value={roleToGive}
                        disabled={busy !== null}
                        onChange={(event) => setRoleToGive(event.target.value as CadetTeamRole)}
                      />
                      <Button type="submit" loading={busy === "team-give"} disabled={busy !== null || roleToGive === "" || roleToGive === team.role}>
                        {busy === "team-give" ? t.team.giving : t.team.give}
                      </Button>
                    </form>
                  ) : null}
                  {team.role && team.assignable.includes(team.role) ? (
                    <Button variant="secondary" loading={busy === "team-take"} disabled={busy !== null} onClick={() => void changeTeamRole("take")}>
                      {busy === "team-take" ? t.team.taking : t.team.take}
                    </Button>
                  ) : null}
                </>
              )}
            </Card>
          ) : null}

          <Card>
            <form onSubmit={saveTicket} noValidate className="gap-space-3 flex flex-col">
              <h2 className="type-heading text-foreground">{t.ticketTitle}</h2>
              <SelectField label={t.ticketLabel} hint={t.ticketHint} options={ticketOptions} value={ticket} disabled={busy !== null} onChange={(event) => setTicket(event.target.value as TicketType)} />
              <p className="type-caption text-text-subtle">{ticketSource}</p>
              <Button type="submit" loading={busy === "ticket"} disabled={busy !== null || !ticketChanged}>
                {t.saveTicket}
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
            <h2 className="type-heading text-danger-ink">{t.deleteTitle}</h2>
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
