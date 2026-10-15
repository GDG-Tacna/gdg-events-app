"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isCheckpointId, type CheckpointKind } from "@/features/checkins";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, Card, FormDialog, Icon, InlineAlert, TextField, type IconName } from "@/shared/ui";
import { normalizeName, suggestId } from "../domain/manage";
import { STATION_KINDS } from "../domain/serve";
import { FoodRequirementsEditor, requirementsSummary, type LevelOption } from "./FoodRequirementsEditor";
import type {
  CheckpointView,
  CreateCheckpointAction,
  ManageActionResult,
  RenameCheckpointAction,
  SetCheckpointActiveAction,
  SetFoodRequirementsAction,
} from "./manage-action";

export interface CheckpointsAdminViewProps {
  checkpoints: readonly CheckpointView[];
  create: CreateCheckpointAction;
  rename: RenameCheckpointAction;
  setActive: SetCheckpointActiveAction;
  setRequirements: SetFoodRequirementsAction;
  /** The edition's rank ladder, to name the minimum level of a meal. */
  levels: readonly LevelOption[];
}

type Notice = { kind: "success" | "error"; text: string } | null;

/** Which dialog is open, and for which checkpoint. */
type OpenDialog = { kind: "create" } | { kind: "rename"; checkpoint: CheckpointView } | { kind: "requirements"; checkpoint: CheckpointView } | null;

const chip = "type-caption border-line-strong text-foreground px-space-3 rounded-full border py-1";

/** The line icon of each kind of checkpoint. */
const KIND_ICON: Record<CheckpointKind, IconName> = { entrance: "door", catering: "coffee", stand: "store", talk: "mic" };

function KindChoice({ value, onChange, disabled }: { value: CheckpointKind; onChange: (kind: CheckpointKind) => void; disabled: boolean }) {
  return (
    <fieldset className="gap-space-2 flex flex-col" disabled={disabled}>
      <legend className="type-label text-foreground mb-space-2">{copy.admin.checkpoints.kindLegend}</legend>
      <div className="gap-space-3 grid grid-cols-1">
        {STATION_KINDS.map((kind) => (
          <label key={kind} className="relative block cursor-pointer">
            <input type="radio" name="checkpoint-kind" value={kind} checked={value === kind} onChange={() => onChange(kind)} className="peer sr-only" />
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
    </fieldset>
  );
}

/**
 * The Puestos screen: every station staff operate (entrance, catering, stand) with its kind's icon, its state and, for
 * a meal, its requirements; on each row renaming, the requirements and opening or closing, and "Nuevo puesto" on top.
 * Creating, renaming and the requirements open in a dialog, where a refusal shows too. Nothing is deleted: a closed
 * checkpoint keeps its history. The server decides everything; this view shows the outcome.
 */
export function CheckpointsAdminView({ checkpoints, create, rename, setActive, setRequirements, levels }: CheckpointsAdminViewProps) {
  const t = copy.admin.checkpoints;
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [idDraft, setIdDraft] = useState<string | null>(null);
  const [kind, setKind] = useState<CheckpointKind>("catering");
  const [touched, setTouched] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  const id = idDraft ?? suggestId(name);
  const nameError = touched && normalizeName(name) === null ? t.errors["invalid-name"] : null;
  const idError = touched && !isCheckpointId(id) ? t.errors["invalid-id"] : null;

  function openDialog(next: OpenDialog) {
    setNotice(null);
    setDialogError(null);
    setDialog(next);
  }
  const closeOnDismiss = (isOpen: boolean) => {
    if (!isOpen) setDialog(null);
  };

  /** Runs one change: marks what is busy, shows the outcome (inside the open dialog for a refusal) and refreshes the list. */
  async function run(key: string, action: () => Promise<ManageActionResult>, success: (checkpoint: CheckpointView) => string) {
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
      const text = t.errors[result.code];
      if (dialog) setDialogError(text);
      else setNotice({ kind: "error", text });
      return false;
    }
    setNotice({ kind: "success", text: success(result.checkpoint) });
    router.refresh();
    return true;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setTouched(true);
    if (normalizeName(name) === null || !isCheckpointId(id)) return;

    const done = await run("create", () => create({ name, id, kind }), (checkpoint) => interpolate(t.created, { name: checkpoint.name }));
    if (done) {
      setName("");
      setIdDraft(null);
      setTouched(false);
      setDialog(null);
    }
  }

  async function handleRename(event: FormEvent<HTMLFormElement>, checkpoint: CheckpointView) {
    event.preventDefault();
    if (busy) return;
    const done = await run(`rename:${checkpoint.id}`, () => rename({ id: checkpoint.id, name: renameDraft }), (updated) => interpolate(t.renamed, { name: updated.name }));
    if (done) setDialog(null);
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
                    <span aria-hidden="true" className="border-cyan/40 text-cyan bg-bg-deep grid size-11 shrink-0 place-items-center rounded-md border">
                      <Icon name={KIND_ICON[checkpoint.kind]} size={20} />
                    </span>
                    <div className="gap-space-1 flex min-w-0 flex-1 flex-col">
                      <p className={cn("type-label truncate", checkpoint.active ? "text-foreground" : "text-text-subtle")}>{checkpoint.name}</p>
                      <p className="type-caption text-text-subtle truncate">{checkpoint.id}</p>
                      {checkpoint.kind === "catering" ? <p className="type-caption text-muted-foreground">{requirementsSummary(checkpoint.requirements, levels)}</p> : null}
                    </div>
                    <div className="gap-space-2 flex shrink-0 flex-col items-end min-[560px]:flex-row">
                      <span className={chip}>{t.kinds[checkpoint.kind]}</span>
                      <span className={cn(chip, checkpoint.active ? "border-accent/70" : "text-text-subtle")}>{checkpoint.active ? t.open : t.closed}</span>
                    </div>
                  </div>
                  <div className="gap-space-2 -ml-space-4 flex flex-wrap items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      aria-label={`${t.rename}: ${checkpoint.name}`}
                      onClick={() => {
                        setRenameDraft(checkpoint.name);
                        openDialog({ kind: "rename", checkpoint });
                      }}
                    >
                      {t.rename}
                    </Button>
                    {checkpoint.kind === "catering" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy !== null}
                        aria-label={`${t.requirements.edit}: ${checkpoint.name}`}
                        onClick={() => openDialog({ kind: "requirements", checkpoint })}
                      >
                        {t.requirements.edit}
                      </Button>
                    ) : null}
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
          <KindChoice value={kind} onChange={setKind} disabled={busy !== null} />
          <Button type="submit" block loading={busy === "create"} disabled={busy !== null}>
            {busy === "create" ? t.creating : t.create}
          </Button>
        </form>
      </FormDialog>

      <FormDialog open={dialog?.kind === "rename"} onOpenChange={closeOnDismiss} title={t.rename} description={dialog?.kind === "rename" ? dialog.checkpoint.name : undefined}>
        {dialog?.kind === "rename" ? (
          <form onSubmit={(event) => void handleRename(event, dialog.checkpoint)} noValidate className="gap-space-4 flex flex-col">
            {dialogError ? <InlineAlert>{dialogError}</InlineAlert> : null}
            <TextField label={t.nameLabel} value={renameDraft} maxLength={60} readOnly={busy !== null} onChange={(event) => setRenameDraft(event.target.value)} />
            <div className="gap-space-3 flex">
              <Button type="submit" loading={busy !== null}>
                {busy !== null ? t.saving : t.save}
              </Button>
              <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => setDialog(null)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        ) : null}
      </FormDialog>

      <FormDialog
        open={dialog?.kind === "requirements"}
        onOpenChange={closeOnDismiss}
        title={t.requirements.title}
        description={dialog?.kind === "requirements" ? dialog.checkpoint.name : undefined}
      >
        {dialog?.kind === "requirements" ? (
          <div className="gap-space-4 flex flex-col">
            {dialogError ? <InlineAlert>{dialogError}</InlineAlert> : null}
            <FoodRequirementsEditor
              requirements={dialog.checkpoint.requirements}
              levels={levels}
              busy={busy !== null}
              onCancel={() => setDialog(null)}
              onSave={(requirements) =>
                void run(`gate:${dialog.checkpoint.id}`, () => setRequirements({ id: dialog.checkpoint.id, ...requirements }), (updated) =>
                  interpolate(t.requirements.saved, { name: updated.name }),
                ).then((done) => {
                  if (done) setDialog(null);
                })
              }
            />
          </div>
        ) : null}
      </FormDialog>
    </div>
  );
}
