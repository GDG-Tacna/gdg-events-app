"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EDITION } from "@/shared/config/edition";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, FormDialog, Icon, InlineAlert, TextField } from "@/shared/ui";
import type { InviteSpeakerAction, SpeakerAccessView, UnlinkSpeakerAction } from "./actions";

const t = copy.admin.speakers.access;
const formatDate = (at: Date) =>
  new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: EDITION.timeZone }).format(new Date(at));

/** One line about a speaker's access, for their card. Empty when they have none. */
export function accessLine(access: SpeakerAccessView | undefined): string | null {
  if (!access || access.state === "none") return null;
  if (access.state === "linked") return access.email ? interpolate(t.linkedAs, { email: access.email }) : t.linked;
  return interpolate(access.expired ? t.invitedExpired : t.invited, { email: access.email, date: formatDate(access.expiresAt) });
}

export interface SpeakerAccessDialogProps {
  speaker: { id: string; name: string } | null;
  access: SpeakerAccessView | undefined;
  invite: InviteSpeakerAction;
  unlink: UnlinkSpeakerAction;
  /** The app's address for the copied link; the screen's own origin when absent. */
  origin?: string;
  onClose: () => void;
}

/**
 * A speaker's access: an invitation link for their email (shown once, to copy and send), which links their account so
 * they show their own code on their phone; and taking it away, which stops the old link and the account's code.
 */
export function SpeakerAccessDialog({ speaker, access, invite, unlink, origin, onClose }: SpeakerAccessDialogProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"invite" | "unlink" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [unlinked, setUnlinked] = useState(false);

  function close() {
    if (busy) return;
    setEmail("");
    setError(null);
    setLink(null);
    setCopied(false);
    setUnlinked(false);
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!speaker || busy) return;
    setBusy("invite");
    setError(null);
    let result;
    try {
      result = await invite({ speakerId: speaker.id, email });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    setBusy(null);
    if (!result.ok) return setError(t.errors[result.code]);
    setLink(`${origin ?? window.location.origin}${result.path}`);
    setCopied(false);
    setUnlinked(false);
    router.refresh();
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // No clipboard access: the link stays selectable on screen.
      setCopied(false);
    }
  }

  async function takeAway() {
    if (!speaker || busy) return;
    setBusy("unlink");
    setError(null);
    let result;
    try {
      result = await unlink({ speakerId: speaker.id });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    setBusy(null);
    if (!result.ok) return setError(t.errors[result.code]);
    setLink(null);
    setUnlinked(true);
    router.refresh();
  }

  const line = unlinked || link ? null : accessLine(access);
  const hasAccess = !unlinked && (link !== null || (access !== undefined && access.state !== "none"));

  return (
    <FormDialog open={speaker !== null} onOpenChange={(open) => (open ? undefined : close())} title={t.title} description={speaker?.name}>
      <div className="gap-space-4 flex flex-col">
        <p className="type-body-sm text-muted-foreground">{t.help}</p>
        {line ? <p className="type-body-sm text-foreground">{line}</p> : null}
        {unlinked ? (
          <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
            {t.unlinkedDone}
          </p>
        ) : null}
        {error ? <InlineAlert>{error}</InlineAlert> : null}

        {link ? (
          <div role="status" className="border-cyan/60 bg-bg-deep p-space-3 gap-space-2 flex flex-col rounded-md border">
            <p className="type-body-sm text-foreground">{t.created}</p>
            <code className="type-caption text-cyan break-all select-all">{link}</code>
            <Button type="button" variant="secondary" size="sm" className="gap-space-2 self-start" onClick={() => void copyLink()}>
              <Icon name={copied ? "check" : "share"} size={16} />
              {copied ? t.copied : t.copy}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="gap-space-3 flex flex-col">
            <TextField label={t.email} hint={t.emailHint} type="email" value={email} autoComplete="off" disabled={busy !== null} onChange={(event) => setEmail(event.target.value)} />
            <Button type="submit" icon="plus" loading={busy === "invite"} disabled={busy !== null} className="self-start">
              {hasAccess ? t.replace : t.create}
            </Button>
          </form>
        )}

        {hasAccess ? (
          <Button type="button" variant="ghost" loading={busy === "unlink"} disabled={busy !== null} className="self-start" onClick={() => void takeAway()}>
            {t.unlink}
          </Button>
        ) : null}
      </div>
    </FormDialog>
  );
}
