"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EDITION } from "@/shared/config/edition";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, Card, FormDialog, Icon, InlineAlert, TextField } from "@/shared/ui";
import { EDITION_NAME_MAX, EDITION_VENUE_MAX, suggestEditionId, type EditionStatus } from "../domain/editions";
import { toEventLocal } from "../domain/event";
import type { EditionModule } from "../domain/modules";
import type { EditionPermissions } from "../domain/permissions";
import type { CopyEditionAction, EditionActionResult, PublishEditionAction, SaveEditionAction, SaveModulesAction, SavePermissionsAction, SetEditionStatusAction } from "./actions";
import { PermissionsDialog } from "./PermissionsDialog";
import { ModulesDialog } from "./ModulesDialog";
import { CopyEditionDialog } from "./CopyEditionDialog";

/** One edition as the screen gets it from the server (dates as ISO strings). */
export interface EditionRow {
  id: string;
  name: string | null;
  venue: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: EditionStatus;
  isPublic: boolean;
}

export interface EventsAdminViewProps {
  editions: readonly EditionRow[];
  /** Server clock when the page was made, so "already ended" does not depend on the device clock. */
  now: string;
  /** An admin of every edition creates, finishes and publishes; an organizer only edits their edition's details. */
  canManage: boolean;
  create: SaveEditionAction;
  update: SaveEditionAction;
  setStatus: SetEditionStatusAction;
  publish: PublishEditionAction;
  /** Copies another edition's content in (admins of every edition only). */
  copyContent?: CopyEditionAction;
  /** The modules each edition has off, by edition id, and the action that saves them (admins of every edition only). */
  modules?: Readonly<Record<string, readonly EditionModule[]>>;
  saveModules?: SaveModulesAction;
  /** What each edition lets organizers and staff do, by edition id, and the action that saves it (admins of every edition only). */
  permissions?: Readonly<Record<string, EditionPermissions>>;
  savePermissions?: SavePermissionsAction;
}

const t = copy.admin.events;
type Stage = keyof typeof t.stage;
const STAGE_STYLE: Record<Stage, string> = { live: "border-accent text-accent", draft: "border-line-strong text-muted-foreground", finished: "border-line-strong text-text-subtle" };

const formatDate = (iso: string) => new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: EDITION.timeZone }).format(new Date(iso));
const nameOf = (edition: EditionRow) => edition.name ?? edition.id;

function datesOf(edition: EditionRow): string {
  if (edition.startsAt && edition.endsAt) return interpolate(t.dates, { start: formatDate(edition.startsAt), end: formatDate(edition.endsAt) });
  if (edition.startsAt) return interpolate(t.startsOnly, { date: formatDate(edition.startsAt) });
  if (edition.endsAt) return interpolate(t.endsOnly, { date: formatDate(edition.endsAt) });
  return t.noDates;
}

interface FormState {
  mode: "create" | "edit";
  id: string;
  /** While creating, the id follows the name until the admin types one. */
  idTouched: boolean;
  name: string;
  venue: string;
  startsAt: string;
  endsAt: string;
}

const emptyForm: FormState = { mode: "create", id: "", idTouched: false, name: "", venue: "", startsAt: "", endsAt: "" };

/**
 * The Eventos screen: every edition with its state (the one in course, drafts being prepared, finished ones), its
 * dates and place. An admin of every edition creates them, finishes or reopens them and makes one public, asking first
 * because cadets, staff and the stage move to it; an organizer only edits their edition's details. The server checks it all.
 */
export function EventsAdminView({ editions, now, canManage, create, update, setStatus, publish, copyContent, modules, saveModules, permissions, savePermissions }: EventsAdminViewProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<EditionRow | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [copyTarget, setCopyTarget] = useState<EditionRow | null>(null);
  const [modulesTarget, setModulesTarget] = useState<EditionRow | null>(null);
  const [permissionsTarget, setPermissionsTarget] = useState<EditionRow | null>(null);

  const current = editions.find((edition) => edition.isPublic);
  const ended = (edition: EditionRow) => edition.status === "finished" || (edition.endsAt !== null && new Date(now).getTime() >= new Date(edition.endsAt).getTime());
  const stageOf = (edition: EditionRow): Stage => (edition.isPublic ? "live" : ended(edition) ? "finished" : "draft");

  async function run(key: string, action: () => Promise<EditionActionResult>): Promise<EditionActionResult> {
    setBusy(key);
    let result: EditionActionResult;
    try {
      result = await action();
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);
    if (result.ok) router.refresh();
    return result;
  }

  function openCreate() {
    setNotice(null);
    setFormError(null);
    setForm(emptyForm);
  }

  function openEdit(edition: EditionRow) {
    setNotice(null);
    setFormError(null);
    setForm({
      mode: "edit",
      id: edition.id,
      idTouched: true,
      name: edition.name ?? "",
      venue: edition.venue ?? "",
      startsAt: edition.startsAt ? toEventLocal(new Date(edition.startsAt)) : "",
      endsAt: edition.endsAt ? toEventLocal(new Date(edition.endsAt)) : "",
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || busy) return;
    const input = { id: form.id.trim(), draft: { name: form.name, venue: form.venue, startsAt: form.startsAt, endsAt: form.endsAt } };
    const result = await run("form", () => (form.mode === "create" ? create(input) : update(input)));
    if (!result.ok) {
      setFormError(t.errors[result.code]);
      return;
    }
    const name = form.name.trim().replace(/\s+/g, " ");
    setForm(null);
    setNotice({ kind: "success", text: form.mode === "create" ? interpolate(t.created, { name }) : t.saved });
  }

  async function handlePublish() {
    if (!publishing || busy) return;
    const result = await run("publish", () => publish({ id: publishing.id }));
    if (!result.ok) {
      setPublishError(t.errors[result.code]);
      return;
    }
    setNotice({ kind: "success", text: interpolate(t.published, { name: nameOf(publishing) }) });
    setPublishing(null);
  }

  async function handleStatus(edition: EditionRow, status: EditionStatus) {
    setNotice(null);
    const result = await run(`status:${edition.id}`, () => setStatus({ id: edition.id, status }));
    setNotice(
      result.ok
        ? { kind: "success", text: interpolate(status === "finished" ? t.finishedDone : t.reopenedDone, { name: nameOf(edition) }) }
        : { kind: "error", text: t.errors[result.code] },
    );
  }

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-3 flex flex-wrap items-end justify-between">
        <div className="gap-space-1 flex flex-col">
          <h1 className="type-title-xl text-foreground">{t.title}</h1>
          <p className="type-body text-muted-foreground">{canManage ? t.subtitle : t.subtitleOrganizer}</p>
        </div>
        {canManage ? (
          <Button icon="plus" disabled={busy !== null} onClick={openCreate}>
            {t.create}
          </Button>
        ) : null}
      </header>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      <ul aria-label={t.listLabel} className="gap-space-3 flex flex-col">
        {editions.map((edition) => {
          const stage = stageOf(edition);
          const label = (action: string) => `${action}: ${nameOf(edition)}`;
          return (
            <li key={edition.id}>
              <Card className={cn("gap-space-3 flex flex-col", edition.isPublic && "border-accent/60")}>
                <div className="gap-space-3 flex items-start">
                  <span aria-hidden="true" className="bg-bg-deep border-line-strong text-cyan grid size-12 shrink-0 place-items-center rounded-md border">
                    <Icon name="calendar" size={22} />
                  </span>
                  <div className="gap-space-1 flex min-w-0 flex-1 flex-col">
                    <p className="type-label text-foreground">{nameOf(edition)}</p>
                    <p className="type-caption text-text-subtle font-mono break-all">{edition.id}</p>
                    <p className="type-body-sm text-muted-foreground">{datesOf(edition)}</p>
                    {edition.venue ? <p className="type-body-sm text-muted-foreground">{edition.venue}</p> : null}
                    {edition.isPublic && ended(edition) ? <p className="type-caption text-text-subtle">{t.ended}</p> : null}
                  </div>
                  <span className={cn("type-caption px-space-3 shrink-0 rounded-full border py-1", STAGE_STYLE[stage])}>{t.stage[stage]}</span>
                </div>
                <div className="gap-space-2 flex flex-wrap items-center justify-end">
                  <Button variant="ghost" size="sm" icon="edit" disabled={busy !== null} aria-label={label(t.edit)} onClick={() => openEdit(edition)}>
                    {t.edit}
                  </Button>
                  {canManage ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      aria-label={label(edition.status === "finished" ? t.reopen : t.finish)}
                      onClick={() => void handleStatus(edition, edition.status === "finished" ? "draft" : "finished")}
                    >
                      {edition.status === "finished" ? t.reopen : t.finish}
                    </Button>
                  ) : null}
                  {canManage && saveModules ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="settings"
                      disabled={busy !== null}
                      aria-label={label(t.modules.open)}
                      onClick={() => {
                        setNotice(null);
                        setModulesTarget(edition);
                      }}
                    >
                      {t.modules.open}
                    </Button>
                  ) : null}
                  {canManage && savePermissions && permissions?.[edition.id] ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="users"
                      disabled={busy !== null}
                      aria-label={label(t.permissions.open)}
                      onClick={() => {
                        setNotice(null);
                        setPermissionsTarget(edition);
                      }}
                    >
                      {t.permissions.open}
                    </Button>
                  ) : null}
                  {canManage && copyContent && editions.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="copy"
                      disabled={busy !== null}
                      aria-label={label(t.copy.open)}
                      onClick={() => {
                        setNotice(null);
                        setCopyTarget(edition);
                      }}
                    >
                      {t.copy.open}
                    </Button>
                  ) : null}
                  {canManage && !edition.isPublic ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy !== null}
                      aria-label={label(t.publish)}
                      onClick={() => {
                        setNotice(null);
                        setPublishError(null);
                        setPublishing(edition);
                      }}
                    >
                      {t.publish}
                    </Button>
                  ) : null}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <FormDialog
        open={form !== null}
        onOpenChange={(open) => {
          if (!open && busy === null) setForm(null);
        }}
        title={form?.mode === "create" ? t.form.createTitle : t.form.editTitle}
        description={form?.mode === "edit" ? form.id : undefined}
      >
        {form ? (
          <form onSubmit={handleSave} noValidate className="gap-space-4 flex flex-col">
            {formError ? <InlineAlert>{formError}</InlineAlert> : null}
            <TextField
              label={t.form.name}
              hint={t.form.nameHint}
              value={form.name}
              maxLength={EDITION_NAME_MAX}
              autoComplete="off"
              readOnly={busy !== null}
              onChange={(event) => {
                const name = event.target.value;
                setForm((prev) => prev && { ...prev, name, id: prev.mode === "create" && !prev.idTouched ? suggestEditionId(name) : prev.id });
              }}
            />
            {form.mode === "create" ? (
              <TextField
                label={t.form.id}
                hint={t.form.idHint}
                value={form.id}
                maxLength={48}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                readOnly={busy !== null}
                onChange={(event) => {
                  const id = event.target.value;
                  setForm((prev) => prev && { ...prev, id, idTouched: true });
                }}
              />
            ) : null}
            <TextField
              label={t.form.venue}
              hint={t.form.venueHint}
              value={form.venue}
              maxLength={EDITION_VENUE_MAX}
              autoComplete="off"
              readOnly={busy !== null}
              onChange={(event) => {
                const venue = event.target.value;
                setForm((prev) => prev && { ...prev, venue });
              }}
            />
            <div className="gap-space-4 grid grid-cols-1 sm:grid-cols-2">
              <TextField
                label={t.form.startsAt}
                type="datetime-local"
                value={form.startsAt}
                readOnly={busy !== null}
                onChange={(event) => {
                  const startsAt = event.target.value;
                  setForm((prev) => prev && { ...prev, startsAt });
                }}
              />
              <TextField
                label={t.form.endsAt}
                type="datetime-local"
                value={form.endsAt}
                readOnly={busy !== null}
                onChange={(event) => {
                  const endsAt = event.target.value;
                  setForm((prev) => prev && { ...prev, endsAt });
                }}
              />
            </div>
            <p className="type-caption text-text-subtle">{t.form.datesHint}</p>
            <Button type="submit" block loading={busy === "form"} disabled={busy !== null}>
              {busy === "form" ? t.form.saving : t.form.save}
            </Button>
          </form>
        ) : null}
      </FormDialog>

      {savePermissions ? (
        <PermissionsDialog
          target={permissionsTarget && permissions?.[permissionsTarget.id] ? { id: permissionsTarget.id, name: nameOf(permissionsTarget), permissions: permissions[permissionsTarget.id] } : null}
          save={savePermissions}
          onClose={() => setPermissionsTarget(null)}
          onSaved={(message) => {
            setPermissionsTarget(null);
            setNotice({ kind: "success", text: message });
            router.refresh();
          }}
        />
      ) : null}

      {saveModules ? (
        <ModulesDialog
          target={modulesTarget ? { id: modulesTarget.id, name: nameOf(modulesTarget), off: modules?.[modulesTarget.id] ?? [] } : null}
          save={saveModules}
          onClose={() => setModulesTarget(null)}
          onSaved={(message) => {
            setModulesTarget(null);
            setNotice({ kind: "success", text: message });
            router.refresh();
          }}
        />
      ) : null}

      {copyContent ? (
        <CopyEditionDialog
          target={copyTarget ? { id: copyTarget.id, name: nameOf(copyTarget) } : null}
          sources={editions.filter((edition) => edition.id !== copyTarget?.id).map((edition) => ({ id: edition.id, name: nameOf(edition) }))}
          copyContent={copyContent}
          onClose={() => setCopyTarget(null)}
          onCopied={(message) => {
            setCopyTarget(null);
            setNotice({ kind: "success", text: message });
            router.refresh();
          }}
        />
      ) : null}

      <FormDialog
        open={publishing !== null}
        onOpenChange={(open) => {
          if (!open && busy === null) setPublishing(null);
        }}
        title={t.publishTitle}
        description={publishing ? interpolate(t.publishBody, { name: nameOf(publishing), current: current ? nameOf(current) : "" }) : undefined}
      >
        <div className="gap-space-3 flex flex-col">
          {publishError ? <InlineAlert>{publishError}</InlineAlert> : null}
          <div className="gap-space-3 flex flex-wrap">
            <Button loading={busy === "publish"} disabled={busy !== null} onClick={() => void handlePublish()}>
              {busy === "publish" ? t.publishing : t.publishConfirm}
            </Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => setPublishing(null)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      </FormDialog>
    </div>
  );
}
