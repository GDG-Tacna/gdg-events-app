"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isCheckpointId, type CheckpointKind } from "@/features/checkins";
import { ImageField, type ImageRef, type UploadImageAction } from "@/features/media";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, Card, FormDialog, Icon, InlineAlert, TextAreaField, TextField, Thumbnail, useConfirm, type IconName } from "@/shared/ui";
import { DESCRIPTION_MAX_LENGTH, normalizeName, suggestId } from "../domain/manage";
import type { ManageErrorCode } from "../domain/manage-error";
import { STATION_KINDS } from "../domain/serve";
import { FoodRequirementsEditor, draftOf, readDraft, requirementsSummary, type LevelOption, type RequirementsDraft } from "./FoodRequirementsEditor";
import type {
  CheckpointLockReason,
  CheckpointView,
  CreateCheckpointAction,
  DeleteCheckpointAction,
  DeleteCheckpointActionResult,
  EditCheckpointAction,
  ManageActionResult,
  SetCheckpointActiveAction,
} from "./manage-action";

export interface CheckpointsAdminViewProps {
  checkpoints: readonly CheckpointView[];
  create: CreateCheckpointAction;
  edit: EditCheckpointAction;
  setActive: SetCheckpointActiveAction;
  remove: DeleteCheckpointAction;
  /** Uploads a puesto's image (the media feature's action). */
  upload: UploadImageAction;
  /**
   * Per puesto id, why its kind and id cannot change (decided by the server page; absent or null when they can). The
   * server checks again on save.
   */
  locks?: Readonly<Record<string, CheckpointLockReason | null>>;
  /** Where an entrance's or a stand's code is shown (`${qrBase}/${id}`); without it they have no such button. A plain path: a client component cannot receive functions from a server page. */
  qrBase?: string;
  /** Whether the session may delete stations here (a draft edition, or an admin of every edition); the server decides again. */
  canDelete?: boolean;
  /** The edition's rank ladder, to name the minimum level of a meal. */
  levels: readonly LevelOption[];
}

type Notice = { kind: "success" | "error"; text: string } | null;

/** Which dialog is open, and for which checkpoint. */
type OpenDialog = { kind: "create" } | { kind: "edit"; checkpoint: CheckpointView } | null;

const chip = "type-caption border-line-strong text-foreground px-space-3 rounded-full border py-1";

/** The line icon of each kind of checkpoint. */
const KIND_ICON: Record<CheckpointKind, IconName> = { entrance: "door", catering: "coffee", stand: "store", talk: "mic" };

function KindChoice({
  name,
  value,
  onChange,
  disabled,
  error,
  note,
}: {
  /** The radio group's name (each dialog has its own). */
  name: string;
  value: CheckpointKind | null;
  onChange: (kind: CheckpointKind) => void;
  disabled: boolean;
  error?: string | null;
  /** Why the kind cannot change, under the options. */
  note?: string | null;
}) {
  return (
    <fieldset className="gap-space-2 flex flex-col" disabled={disabled}>
      <legend className="type-label text-foreground mb-space-2">{copy.admin.checkpoints.kindLegend}</legend>
      <div className="gap-space-3 grid grid-cols-1">
        {STATION_KINDS.map((kind) => (
          <label key={kind} className={cn("relative block", disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer")}>
            <input type="radio" name={name} value={kind} checked={value === kind} onChange={() => onChange(kind)} className="peer sr-only" />
            <span
              className={cn(
                "gap-space-3 p-space-3 flex min-h-12 items-center rounded-md border transition-colors",
                "border-line-strong bg-bg-deep peer-checked:border-primary peer-checked:bg-surface-raised",
                "peer-focus-visible:ring-ring peer-focus-visible:ring-[3px]",
              )}
            >
              <Icon name={KIND_ICON[kind]} size={20} className="text-cyan shrink-0" />
              <span className="gap-space-1 flex flex-col">
                <span className="type-label text-foreground">{copy.admin.checkpoints.kinds[kind]}</span>
                <span className="type-caption text-text-subtle">{copy.admin.checkpoints.kindHelp[kind]}</span>
              </span>
            </span>
          </label>
        ))}
      </div>
      {note ? <p className="type-caption text-muted-foreground">{note}</p> : null}
      {error ? (
        <p role="alert" className="type-caption text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** The message for a refusal inside the edit dialog: a lock is said as a lock, not as a failed delete. */
function editErrorText(code: ManageErrorCode): string {
  const t = copy.admin.checkpoints;
  return code === "has-check-ins" || code === "has-missions" || code === "from-plan" || code === "edition-locked" ? t.edit.locks[code] : t.errors[code];
}

interface EditFormProps {
  checkpoint: CheckpointView;
  lock: CheckpointLockReason | null;
  levels: readonly LevelOption[];
  upload: UploadImageAction;
  busy: boolean;
  error: string | null;
  onSave: (input: Parameters<EditCheckpointAction>[0]) => void;
  onCancel: () => void;
}

/**
 * «Editar puesto»: name, description and image always; kind and identifier only when nothing locks them (shown disabled
 * with the reason otherwise); a meal's requirements while it is a catering puesto.
 */
function EditCheckpointForm({ checkpoint, lock, levels, upload, busy, error, onSave, onCancel }: EditFormProps) {
  const t = copy.admin.checkpoints;
  const [name, setName] = useState(checkpoint.name);
  const [id, setId] = useState(checkpoint.id);
  const [kind, setKind] = useState<CheckpointKind>(checkpoint.kind);
  const [description, setDescription] = useState(checkpoint.description);
  const [image, setImage] = useState<ImageRef | null>(checkpoint.image);
  const [imageChanged, setImageChanged] = useState(false);
  const [requirements, setRequirements] = useState<RequirementsDraft>(draftOf(checkpoint.requirements));
  const [touched, setTouched] = useState(false);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);

  const locked = lock !== null;
  const lockText = lock ? t.edit.locks[lock] : null;
  const nameError = touched && normalizeName(name) === null ? t.errors["invalid-name"] : null;
  const idError = touched && !locked && !isCheckpointId(id) ? t.errors["invalid-id"] : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setTouched(true);
    if (normalizeName(name) === null || (!locked && !isCheckpointId(id))) return;
    let gate: { minLevel: number | null; minTalks: number | null } | undefined;
    if (kind === "catering") {
      const read = readDraft(requirements);
      if (!read.ok) return setRequirementsError(t.errors[read.code]);
      gate = read.value;
    }
    setRequirementsError(null);
    onSave({
      id: checkpoint.id,
      name,
      description,
      ...(imageChanged ? { imagePath: image?.path ?? null } : {}),
      ...(!locked && kind !== checkpoint.kind ? { kind } : {}),
      ...(!locked && id !== checkpoint.id ? { newId: id } : {}),
      ...(gate ? { requirements: gate } : {}),
    });
  }

  return (
    <form onSubmit={submit} noValidate className="gap-space-5 flex flex-col">
      {error ? <InlineAlert>{error}</InlineAlert> : null}
      <TextField label={t.nameLabel} value={name} maxLength={60} autoComplete="off" readOnly={busy} error={nameError} onChange={(event) => setName(event.target.value)} onBlur={() => setTouched(true)} />
      <TextField
        label={t.idLabel}
        hint={lockText ?? t.edit.idHint}
        value={id}
        maxLength={48}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={locked}
        readOnly={busy}
        error={idError}
        onChange={(event) => setId(event.target.value)}
        onBlur={() => setTouched(true)}
      />
      <KindChoice name="checkpoint-kind-edit" value={kind} onChange={setKind} disabled={busy || locked} note={lockText} />
      <TextAreaField
        label={t.descriptionLabel}
        hint={t.descriptionHint}
        value={description}
        maxLength={DESCRIPTION_MAX_LENGTH}
        rows={3}
        readOnly={busy}
        counter={{ current: description.length, max: DESCRIPTION_MAX_LENGTH }}
        onChange={(event) => setDescription(event.target.value)}
      />
      <ImageField
        label={t.imageLabel}
        purpose="checkpoint"
        value={image}
        upload={upload}
        disabled={busy}
        onChange={(next) => {
          setImage(next);
          setImageChanged(true);
        }}
      />
      {kind === "catering" ? (
        <FoodRequirementsEditor saved={checkpoint.requirements} draft={requirements} onChange={setRequirements} levels={levels} disabled={busy} error={requirementsError} />
      ) : checkpoint.kind === "catering" ? (
        <p className="type-caption text-muted-foreground">{t.edit.requirementsDropped}</p>
      ) : null}
      <div className="gap-space-3 flex">
        <Button type="submit" loading={busy} disabled={busy}>
          {busy ? t.saving : t.save}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}

/**
 * The Puestos screen: every station staff operate (entrance, catering, stand) with its kind's icon or its image, its
 * description, its state and, for a meal, its requirements; on each row editing, opening or closing, its screen code
 * and deleting, and "Crear un puesto" on top. Creating and editing open in a dialog, where a refusal shows too. The
 * server decides everything; this view shows the outcome.
 */
export function CheckpointsAdminView({ checkpoints, create, edit, setActive, remove, upload, locks = {}, qrBase, canDelete = true, levels }: CheckpointsAdminViewProps) {
  const t = copy.admin.checkpoints;
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [idDraft, setIdDraft] = useState<string | null>(null);
  // No kind is preselected: a stand made as a meal by default would never show in stand missions.
  const [kind, setKind] = useState<CheckpointKind | null>(null);
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<ImageRef | null>(null);
  const [touched, setTouched] = useState(false);

  const id = idDraft ?? suggestId(name);
  const nameError = touched && normalizeName(name) === null ? t.errors["invalid-name"] : null;
  const idError = touched && !isCheckpointId(id) ? t.errors["invalid-id"] : null;
  const kindError = touched && kind === null ? t.kindRequired : null;

  function openDialog(next: OpenDialog) {
    setNotice(null);
    setDialogError(null);
    setDialog(next);
  }
  const closeOnDismiss = (isOpen: boolean) => {
    if (!isOpen) setDialog(null);
  };

  /** Runs one change: marks what is busy, shows the outcome (inside the open dialog for a refusal) and refreshes the list. */
  async function run(key: string, action: () => Promise<ManageActionResult>, success: (checkpoint: CheckpointView) => string, errorText: (code: ManageErrorCode) => string = (code) => t.errors[code]) {
    setBusy(key);
    setNotice(null);
    setDialogError(null);
    let result: ManageActionResult;
    try {
      result = await action();
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);

    if (!result.ok) {
      const text = errorText(result.code);
      if (dialog) setDialogError(text);
      else setNotice({ kind: "error", text });
      return false;
    }
    setNotice({ kind: "success", text: success(result.checkpoint) });
    router.refresh();
    return true;
  }

  async function handleDelete(checkpoint: CheckpointView) {
    if (busy) return;
    const yes = await confirm({ title: interpolate(t.confirmDeleteTitle, { name: checkpoint.name }), description: t.confirmDelete, confirmLabel: t.delete });
    if (!yes) return;
    setBusy(`delete:${checkpoint.id}`);
    setNotice(null);
    let result: DeleteCheckpointActionResult;
    try {
      result = await remove({ id: checkpoint.id });
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);
    if (!result.ok) return setNotice({ kind: "error", text: t.errors[result.code] });
    setNotice({ kind: "success", text: interpolate(t.deletedDone, { name: result.name }) });
    router.refresh();
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setTouched(true);
    if (normalizeName(name) === null || !isCheckpointId(id) || kind === null) return;

    const done = await run("create", () => create({ name, id, kind, description, imagePath: image?.path ?? null }), (checkpoint) => interpolate(t.created, { name: checkpoint.name }));
    if (done) {
      setName("");
      setIdDraft(null);
      setKind(null);
      setDescription("");
      setImage(null);
      setTouched(false);
      setDialog(null);
    }
  }

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-3 flex flex-wrap items-end justify-between">
        <div className="gap-space-1 flex flex-col">
          <h1 className="type-title-xl text-foreground">{t.title}</h1>
          <p className="type-body text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button onClick={() => openDialog({ kind: "create" })} className="gap-space-2">
          <Icon name="plus" size={18} />
          {t.createTitle}
        </Button>
      </header>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      {checkpoints.length === 0 ? (
        <Card>
          <p className="type-body text-muted-foreground">{t.empty}</p>
        </Card>
      ) : (
        <ul aria-label={t.listLabel} className="gap-space-3 flex flex-col">
          {checkpoints.map((checkpoint) => {
            const toggling = busy === `active:${checkpoint.id}`;
            return (
              <li key={checkpoint.id}>
                <Card className={cn("gap-space-3 flex flex-col", !checkpoint.active && "opacity-75")}>
                  <div className="gap-space-3 flex items-start">
                    {checkpoint.image ? (
                      <Thumbnail url={checkpoint.image.url} size={44} />
                    ) : (
                      <span aria-hidden="true" className="border-cyan/40 text-cyan bg-bg-deep grid size-11 shrink-0 place-items-center rounded-md border">
                        <Icon name={KIND_ICON[checkpoint.kind]} size={20} />
                      </span>
                    )}
                    <div className="gap-space-1 flex min-w-0 flex-1 flex-col">
                      <p className={cn("type-label truncate", checkpoint.active ? "text-foreground" : "text-text-subtle")}>{checkpoint.name}</p>
                      <p className="type-caption text-text-subtle truncate">{checkpoint.id}</p>
                      {checkpoint.description ? <p className="type-body-sm text-muted-foreground line-clamp-2">{checkpoint.description}</p> : null}
                      {checkpoint.kind === "catering" ? <p className="type-caption text-muted-foreground">{requirementsSummary(checkpoint.requirements, levels)}</p> : null}
                    </div>
                    <div className="gap-space-2 flex shrink-0 flex-col items-end min-[560px]:flex-row">
                      <span className={chip}>{t.kinds[checkpoint.kind]}</span>
                      <span className={cn(chip, checkpoint.active ? "border-accent/70" : "text-text-subtle")}>{checkpoint.active ? t.open : t.closed}</span>
                    </div>
                  </div>
                  <div className="gap-space-2 -ml-space-4 flex flex-wrap items-center">
                    <Button variant="ghost" size="sm" disabled={busy !== null} aria-label={`${t.edit.action}: ${checkpoint.name}`} onClick={() => openDialog({ kind: "edit", checkpoint })}>
                      {t.edit.action}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      loading={toggling}
                      aria-label={`${checkpoint.active ? t.close : t.reopen}: ${checkpoint.name}`}
                      onClick={() =>
                        void run(`active:${checkpoint.id}`, () => setActive({ id: checkpoint.id, active: !checkpoint.active }), (updated) =>
                          interpolate(updated.active ? t.openedDone : t.closedDone, { name: updated.name }),
                        )
                      }
                    >
                      {toggling ? (checkpoint.active ? t.closing : t.opening) : checkpoint.active ? t.close : t.reopen}
                    </Button>
                    {qrBase && (checkpoint.kind === "entrance" || checkpoint.kind === "stand") && checkpoint.active ? (
                      <Link
                        href={`${qrBase}/${checkpoint.id}`}
                        aria-label={`${checkpoint.kind === "stand" ? t.showStandQr : t.showQr}: ${checkpoint.name}`}
                        className="type-label text-primary hover:bg-secondary focus-visible:ring-ring px-space-4 inline-flex h-9 items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
                      >
                        {checkpoint.kind === "stand" ? t.showStandQr : t.showQr}
                      </Link>
                    ) : null}
                    {canDelete ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy !== null}
                        loading={busy === `delete:${checkpoint.id}`}
                        aria-label={`${t.delete}: ${checkpoint.name}`}
                        onClick={() => void handleDelete(checkpoint)}
                      >
                        <Icon name="trash" size={16} />
                        {t.delete}
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <FormDialog open={dialog?.kind === "create"} onOpenChange={closeOnDismiss} title={t.createTitle}>
        <form onSubmit={handleCreate} noValidate className="gap-space-5 flex flex-col">
          {dialogError ? <InlineAlert>{dialogError}</InlineAlert> : null}
          <TextField
            label={t.nameLabel}
            value={name}
            maxLength={60}
            autoComplete="off"
            readOnly={busy !== null}
            error={nameError}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          <TextField
            label={t.idLabel}
            hint={t.idHint}
            value={id}
            maxLength={48}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            readOnly={busy !== null}
            error={idError}
            onChange={(event) => setIdDraft(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          <KindChoice name="checkpoint-kind" value={kind} onChange={setKind} disabled={busy !== null} error={kindError} />
          <TextAreaField
            label={t.descriptionLabel}
            hint={t.descriptionHint}
            value={description}
            maxLength={DESCRIPTION_MAX_LENGTH}
            rows={3}
            readOnly={busy !== null}
            counter={{ current: description.length, max: DESCRIPTION_MAX_LENGTH }}
            onChange={(event) => setDescription(event.target.value)}
          />
          <ImageField label={t.imageLabel} purpose="checkpoint" value={image} upload={upload} disabled={busy !== null} onChange={setImage} />
          <Button type="submit" block loading={busy === "create"} disabled={busy !== null}>
            {busy === "create" ? t.creating : t.create}
          </Button>
        </form>
      </FormDialog>

      <FormDialog open={dialog?.kind === "edit"} onOpenChange={closeOnDismiss} title={t.edit.title} description={dialog?.kind === "edit" ? dialog.checkpoint.name : undefined}>
        {dialog?.kind === "edit" ? (
          <EditCheckpointForm
            key={dialog.checkpoint.id}
            checkpoint={dialog.checkpoint}
            lock={locks[dialog.checkpoint.id] ?? null}
            levels={levels}
            upload={upload}
            busy={busy !== null}
            error={dialogError}
            onCancel={() => setDialog(null)}
            onSave={(input) =>
              void run(`edit:${dialog.checkpoint.id}`, () => edit(input), (updated) => interpolate(t.edit.saved, { name: updated.name }), editErrorText).then((done) => {
                if (done) setDialog(null);
              })
            }
          />
        ) : null}
      </FormDialog>
      {confirmDialog}
    </div>
  );
}
