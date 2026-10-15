"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EDITION } from "@/shared/config/edition";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, Card, Icon, InlineAlert, TextField } from "@/shared/ui";
import { inviteState, type Invite, type InviteErrorCode } from "../domain/invites";
import { normalizeEmail, type ManagedRole } from "../domain/team";
import type { CreateInviteAction, RevokeInviteAction } from "./invite-actions";

export interface InvitesPanelProps {
  invites: readonly Invite[];
  /** The roles the viewer may invite to (only staff for an organizer). */
  assignable: readonly ManagedRole[];
  create: CreateInviteAction;
  revoke: RevokeInviteAction;
  /** The app's address for the copied link; the screen's own origin when absent. */
  origin?: string;
  now?: () => Date;
}

const t = copy.admin.team.invites;
const roleName = copy.admin.team.roles;
const formatDate = (at: Date) => new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: EDITION.timeZone }).format(new Date(at));
const STATE_STYLE = { pending: "border-cyan/60 text-foreground", accepted: "border-accent/70 text-foreground", expired: "border-line-strong text-text-subtle", revoked: "border-line-strong text-text-subtle" } as const;

/**
 * Invitations by link: an email and a role give a one-use link, shown once to copy (only its hash is kept), and
 * emailed too when the server can. The list shows each invitation's state; a pending one can be revoked.
 */
export function InvitesPanel({ invites, assignable, create, revoke, origin, now = () => new Date() }: InvitesPanelProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ManagedRole>(assignable[0] ?? "staff");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<InviteErrorCode | null>(null);
  const [link, setLink] = useState<{ email: string; url: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeEmail(email);
    if (!normalized) return setError("invalid-email");
    setPending("create");
    setError(null);
    setNotice(null);
    setCopied(false);
    let result;
    try {
      result = await create({ email: normalized, role });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    setPending(null);
    if (!result.ok) return setError(result.code);
    setLink({ email: normalized, url: `${origin ?? window.location.origin}${result.path}`, emailed: result.emailed });
    setEmail("");
    router.refresh();
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // No clipboard access: the link stays selectable on screen.
      setCopied(false);
    }
  }

  async function revokeOne(invite: Invite) {
    setPending(invite.id);
    setError(null);
    setNotice(null);
    let result;
    try {
      result = await revoke({ id: invite.id });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    setPending(null);
    if (!result.ok) return setError(result.code);
    setNotice(t.revokedDone);
    router.refresh();
  }

  return (
    <Card className="gap-space-4 flex flex-col">
      <div className="gap-space-1 flex flex-col">
        <h2 className="type-heading text-foreground">{t.title}</h2>
        <p className="type-caption text-text-subtle">{t.help}</p>
      </div>
      <form onSubmit={submit} noValidate className="gap-space-3 flex flex-col">
        <TextField label={t.emailLabel} type="email" value={email} autoComplete="off" disabled={pending !== null} onChange={(event) => setEmail(event.target.value)} />
        {assignable.length > 1 ? (
          <fieldset className="gap-space-2 flex flex-wrap" disabled={pending !== null}>
            <legend className="type-label text-foreground mb-space-2">{copy.admin.team.roleLegend}</legend>
            {assignable.map((option) => (
              <label key={option} className="relative cursor-pointer">
                <input type="radio" name="invite-role" value={option} checked={role === option} onChange={() => setRole(option)} className="peer sr-only" />
                <span className="type-label border-line-strong bg-bg-deep peer-checked:border-primary peer-checked:bg-surface-raised peer-focus-visible:ring-ring px-space-4 inline-flex h-11 items-center rounded-md border peer-focus-visible:ring-[3px]">
                  {roleName[option]}
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <Button type="submit" icon="plus" loading={pending === "create"} className="self-start">
          {pending === "create" ? t.creating : t.create}
        </Button>
      </form>

      {error ? <InlineAlert>{t.errors[error]}</InlineAlert> : null}
      {notice ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice}
        </p>
      ) : null}
      {link ? (
        <div role="status" className="border-cyan/60 bg-bg-deep p-space-3 gap-space-2 flex flex-col rounded-md border">
          <p className="type-body-sm text-foreground">
            {interpolate(t.created, { email: link.email })} {link.emailed ? t.emailed : null}
          </p>
          <code className="type-caption text-cyan break-all select-all">{link.url}</code>
          <Button type="button" variant="secondary" size="sm" className="gap-space-2 self-start" onClick={() => void copyLink()}>
            <Icon name={copied ? "check" : "share"} size={16} />
            {copied ? t.copied : t.copy}
          </Button>
        </div>
      ) : null}

      <section aria-labelledby="invites-title" className="gap-space-2 flex flex-col">
        <h3 id="invites-title" className="type-label text-foreground">
          {t.listTitle}
        </h3>
        {invites.length === 0 ? <p className="type-body-sm text-muted-foreground">{t.empty}</p> : null}
        <ul aria-label={t.listLabel} className="divide-border flex flex-col divide-y">
          {invites.map((invite) => {
            const state = inviteState(invite, now());
            return (
              <li key={invite.id} className="gap-space-3 py-space-3 flex flex-wrap items-center justify-between">
                <div className="min-w-0">
                  <p className="type-label text-foreground truncate">{invite.email}</p>
                  <p className="type-caption text-text-subtle">{interpolate(t.meta, { role: roleName[invite.role], date: formatDate(invite.expiresAt) })}</p>
                </div>
                <div className="gap-space-2 flex items-center">
                  <span className={cn("type-caption rounded-full border px-3 py-1", STATE_STYLE[state])}>{t.states[state]}</span>
                  {state === "pending" && assignable.includes(invite.role) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon="trash"
                      loading={pending === invite.id}
                      disabled={pending !== null}
                      aria-label={interpolate(t.revokeLabel, { email: invite.email })}
                      onClick={() => void revokeOne(invite)}
                    >
                      {t.revoke}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </Card>
  );
}
