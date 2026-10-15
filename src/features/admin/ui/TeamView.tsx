"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, Card, EditionTag, FormDialog, Icon, InlineAlert, TextField } from "@/shared/ui";
import { MANAGED_ROLES, normalizeEmail, type ManagedRole, type TeamMember } from "../domain/team";
import type { GrantRoleAction, RevokeRoleAction } from "./actions";
import { useTeamActions } from "./use-team-actions";

export interface TeamViewProps {
  members: readonly TeamMember[];
  /** The admin looking at the screen: their own row has no actions (nobody changes their own role). */
  currentUid: string;
  grant: GrantRoleAction;
  revoke: RevokeRoleAction;
  /** The roles the viewer may give and take away: all for an admin, only staff for an organizer. */
  assignable?: readonly ManagedRole[];
  /** The edition whose staff and organizers are listed (admins are global). */
  eventId?: string;
}

const t = copy.admin.team;
const ROLE_STYLE: Record<ManagedRole, string> = { admin: "border-magenta/70", organizer: "border-violet", staff: "border-cyan/60" };

/** Lower case without accents, so "jose" finds "José". */
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function RoleChip({ role }: { role: ManagedRole }) {
  return <span className={cn("type-caption text-foreground px-space-3 shrink-0 rounded-full border py-1", ROLE_STYLE[role])}>{t.roles[role]}</span>;
}

function RoleChoice({ value, onChange, disabled, roles }: { value: ManagedRole; onChange: (role: ManagedRole) => void; disabled: boolean; roles: readonly ManagedRole[] }) {
  return (
    <fieldset className="gap-space-2 flex flex-col" disabled={disabled}>
      <legend className="type-label text-foreground mb-space-2">{t.roleLegend}</legend>
      <div className="gap-space-3 grid grid-cols-1">
        {roles.map((role) => (
          <label key={role} className="relative block cursor-pointer">
            <input type="radio" name="team-role" value={role} checked={value === role} onChange={() => onChange(role)} className="peer sr-only" />
            <span
              className={cn(
                "gap-space-1 p-space-3 flex min-h-12 flex-col rounded-md border transition-colors",
                "border-line-strong bg-bg-deep peer-checked:border-primary peer-checked:bg-surface-raised",
                "peer-focus-visible:ring-ring peer-focus-visible:ring-[3px]",
              )}
            >
              <span className="type-label text-foreground">{t.roles[role]}</span>
              <span className="type-caption text-text-subtle">{t.roleHelp[role]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The Equipo screen: who has a role (admins of the app, staff and organizers of this edition), searchable by name or
 * email, each with a trash icon that asks in a dialog before taking the role away; and "Dar rol" for an account that
 * already signed in. The viewer only manages the roles it may (an organizer: staff). The server decides everything.
 */
export function TeamView({ members, currentUid, grant, revoke, assignable = MANAGED_ROLES, eventId }: TeamViewProps) {
  const router = useRouter();
  const { status, notice, grantRole, revokeRole, clearNotice } = useTeamActions(grant, revoke, () => router.refresh());

  const [query, setQuery] = useState("");
  const [granting, setGranting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ManagedRole>(assignable[0] ?? "staff");
  const [touched, setTouched] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  const busy = status !== "idle";
  const emailError = touched && normalizeEmail(email) === null ? t.errors["invalid-email"] : null;
  const needle = fold(query.trim());
  const shown = members.filter((member) => fold(`${member.displayName ?? ""} ${member.email}`).includes(needle));

  async function handleGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setTouched(true);
    if (normalizeEmail(email) === null) return;
    if (await grantRole(email, role)) {
      setEmail("");
      setTouched(false);
      setGranting(false);
    }
  }

  async function handleRevoke() {
    if (removing && (await revokeRole(removing.email))) setRemoving(null);
  }

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-3 flex flex-wrap items-end justify-between">
        <div className="gap-space-2 flex flex-col">
          <h1 className="type-title-xl text-foreground">{t.title}</h1>
          <p className="type-body text-muted-foreground">{t.subtitle}</p>
          {eventId ? <EditionTag eventId={eventId} /> : null}
        </div>
        <Button
          icon="plus"
          disabled={busy}
          onClick={() => {
            clearNotice();
            setGranting(true);
          }}
        >
          {t.grantOpen}
        </Button>
      </header>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" && !granting && !removing ? <InlineAlert>{notice.text}</InlineAlert> : null}

      <Card className="gap-space-4 flex flex-col">
        <TextField type="search" label={t.search} hint={t.searchHint} value={query} autoComplete="off" onChange={(event) => setQuery(event.target.value)} />
        {members.length > 0 ? <p className="type-caption text-text-subtle">{interpolate(t.count, { n: String(shown.length), total: String(members.length) })}</p> : null}
        <ul aria-label={t.listLabel} className="divide-border flex flex-col divide-y">
          {members.length === 0 ? <li className="type-body text-muted-foreground py-space-2">{t.empty}</li> : null}
          {members.length > 0 && shown.length === 0 ? <li className="type-body text-muted-foreground py-space-2">{interpolate(t.noMatch, { q: query.trim() })}</li> : null}
          {shown.map((member) => {
            const isYou = member.uid === currentUid;
            const name = member.displayName ?? member.email;
            return (
              <li key={member.uid} className="gap-space-3 py-space-3 flex items-center first:pt-0 last:pb-0">
                <span aria-hidden="true" className="bg-bg-deep border-line-strong type-label text-cyan grid size-10 shrink-0 place-items-center rounded-full border uppercase">
                  {name.trim().charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="type-label text-foreground truncate">
                    {name}
                    {isYou ? <span className="text-text-subtle"> · {t.you}</span> : null}
                  </p>
                  {member.displayName ? <p className="type-caption text-text-subtle truncate">{member.email}</p> : null}
                </div>
                <RoleChip role={member.role} />
                {isYou || !assignable.includes(member.role) ? (
                  // Keeps the chips aligned with the rows that have the icon.
                  <span aria-hidden="true" className="size-11 shrink-0" />
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`${t.revoke}: ${member.email}`}
                    title={t.revoke}
                    onClick={() => {
                      clearNotice();
                      setRemoving(member);
                    }}
                    className="text-muted-foreground hover:text-danger hover:bg-secondary focus-visible:ring-ring grid size-11 shrink-0 place-items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-50"
                  >
                    <Icon name="trash" size={20} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <FormDialog
        open={granting}
        onOpenChange={(open) => {
          if (!open && !busy) setGranting(false);
        }}
        title={t.grantTitle}
        description={t.grantHelp}
      >
        <form onSubmit={handleGrant} noValidate className="gap-space-5 flex flex-col">
          {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}
          <TextField
            label={t.emailLabel}
            hint={t.emailHint}
            placeholder={t.emailPlaceholder}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            value={email}
            readOnly={busy}
            error={emailError}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          <RoleChoice roles={assignable} value={role} onChange={setRole} disabled={busy} />
          <Button type="submit" block loading={status === "granting"} disabled={busy}>
            {status === "granting" ? t.granting : t.grant}
          </Button>
        </form>
      </FormDialog>

      <FormDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoving(null);
        }}
        title={t.confirmTitle}
        description={removing ? interpolate(t.confirmRevoke, { email: removing.email }) : undefined}
      >
        <div className="gap-space-3 flex flex-col">
          {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}
          <div className="gap-space-3 flex flex-wrap">
            <Button variant="secondary" icon="trash" loading={status === "revoking"} onClick={() => void handleRevoke()}>
              {status === "revoking" ? t.revoking : t.confirm}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setRemoving(null)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      </FormDialog>
    </div>
  );
}
